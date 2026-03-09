const crypto = require('crypto');
const supabaseService = require('./supabase.service');

/**
 * Template Learning Service
 * Aprende templates automáticamente de extracciones exitosas de Claude
 */
class TemplateLearningService {
  /**
   * Analizar resultado de Claude y crear template si es exitoso
   * @param {Object} extractionResult - Resultado de Claude
   * @param {Array<Object>} structuredData - Datos estructurados del archivo
   * @param {string} bankId - ID del banco detectado
   * @param {string} bankName - Nombre del banco
   * @param {string} fileId - ID del archivo procesado
   * @param {string} userId - ID del usuario
   * @returns {Promise<Object|null>} Template creado o null si no se puede aprender
   */
  async learnFromClaudeResult(extractionResult, structuredData, bankId, bankName, fileId, userId) {
    try {
      // Validación: Solo aprender de extracciones con alta confianza
      if (extractionResult.confidenceScore < 80) {
        console.log('[Template Learning] Confianza muy baja para aprender template:', extractionResult.confidenceScore);
        return null;
      }

      // Validación: Debe haber datos estructurados (CSV/XLSX)
      if (!structuredData || structuredData.length === 0) {
        console.log('[Template Learning] No hay datos estructurados, no se puede aprender template');
        return null;
      }

      // Validación: Debe haber transacciones extraídas
      if (!extractionResult.transactions || extractionResult.transactions.length === 0) {
        console.log('[Template Learning] No hay transacciones extraídas');
        return null;
      }

      console.log(`[Template Learning] Analizando extracción exitosa para banco: ${bankName}`);

      // Paso 1: Detectar estructura de columnas
      const columnMapping = this.detectColumnMapping(structuredData, extractionResult.transactions);
      if (!columnMapping) {
        console.log('[Template Learning] No se pudo detectar mapeo de columnas');
        return null;
      }

      // Paso 2: Generar hash único para evitar duplicados
      const templateHash = this.generateTemplateHash(columnMapping);

      // Paso 3: Verificar si ya existe un template con este hash
      const existingTemplate = await this.findTemplateByHash(templateHash);
      if (existingTemplate) {
        console.log(`[Template Learning] Template ya existe (ID: ${existingTemplate.id}), actualizando estadísticas`);
        await this.updateTemplateStats(existingTemplate.id, true, extractionResult.confidenceScore);
        return existingTemplate;
      }

      // Paso 4: Detectar formato de fecha
      const dateFormat = this.detectDateFormat(structuredData, columnMapping.date_column);

      // Paso 5: Detectar formato de montos
      const amountFormat = this.detectAmountFormat(structuredData, columnMapping.amount_column);

      // Paso 6: Generar patrones de detección
      const detectionPatterns = this.generateDetectionPatterns(structuredData, columnMapping);

      // Paso 7: Analizar patrones de descripción
      const descriptionPatterns = this.analyzeDescriptionPatterns(extractionResult.transactions);

      // Paso 8: Extraer metadata del documento
      const documentMetadata = this.extractDocumentMetadata(extractionResult, structuredData);

      // Paso 9: Crear template en base de datos
      const template = await this.createTemplate({
        bank_id: bankId,
        bank_name: bankName,
        template_hash: templateHash,
        detection_patterns: detectionPatterns,
        column_mapping: columnMapping,
        date_format: dateFormat,
        amount_format: amountFormat,
        description_patterns: descriptionPatterns,
        document_metadata: documentMetadata,
        created_from_file_id: fileId,
        created_by_user_id: userId,
        learned_by: 'claude',
        avg_confidence: extractionResult.confidenceScore
      });

      console.log(`[Template Learning] ✅ Template creado exitosamente (ID: ${template.id}) para ${bankName}`);
      return template;
    } catch (error) {
      console.error('[Template Learning] Error al crear template:', error);
      return null;
    }
  }

  /**
   * Detectar mapeo de columnas comparando datos estructurados con transacciones extraídas
   */
  detectColumnMapping(structuredData, extractedTransactions) {
    if (!structuredData[0]) return null;

    const columns = Object.keys(structuredData[0]);
    const columnsUpper = columns.map(c => c.toUpperCase());

    const mapping = {
      date_column: null,
      description_column: null,
      amount_column: null,
      reference_column: null,
      balance_column: null,
      debit_column: null,
      credit_column: null
    };

    // Detectar columna de fecha
    const dateKeywords = ['FECHA', 'DATE', 'FECHA MOV', 'FECHA TRANS', 'FECHA DE'];
    mapping.date_column = this.findColumnByKeywords(columns, columnsUpper, dateKeywords);

    // Detectar columna de descripción
    const descKeywords = ['DESCRIPCION', 'CONCEPTO', 'DESCRIPTION', 'DETALLE', 'MERCHANT', 'COMERCIO'];
    mapping.description_column = this.findColumnByKeywords(columns, columnsUpper, descKeywords);

    // Detectar columna de monto
    const amountKeywords = ['IMPORTE', 'AMOUNT', 'MONTO', 'VALOR', 'PESOS', 'TOTAL'];
    mapping.amount_column = this.findColumnByKeywords(columns, columnsUpper, amountKeywords);

    // Detectar columna de referencia
    const refKeywords = ['REFERENCIA', 'REFERENCE', 'REF', 'NUM', 'NUMERO', 'NRO'];
    mapping.reference_column = this.findColumnByKeywords(columns, columnsUpper, refKeywords);

    // Detectar columna de saldo
    const balanceKeywords = ['SALDO', 'BALANCE', 'SALDO FINAL'];
    mapping.balance_column = this.findColumnByKeywords(columns, columnsUpper, balanceKeywords);

    // Detectar columnas separadas de débito/crédito (estilo Hipotecario)
    const debitKeywords = ['DEBITO', 'DEBIT', 'DEBE', 'EGRESO'];
    const creditKeywords = ['CREDITO', 'CREDIT', 'HABER', 'INGRESO'];
    mapping.debit_column = this.findColumnByKeywords(columns, columnsUpper, debitKeywords);
    mapping.credit_column = this.findColumnByKeywords(columns, columnsUpper, creditKeywords);

    // Validación: Debe tener al menos fecha y monto (o débito/crédito)
    const hasRequiredFields = mapping.date_column &&
      (mapping.amount_column || (mapping.debit_column && mapping.credit_column));

    if (!hasRequiredFields) {
      console.log('[Template Learning] Faltan columnas requeridas:', mapping);
      return null;
    }

    return mapping;
  }

  /**
   * Buscar columna por palabras clave
   */
  findColumnByKeywords(columns, columnsUpper, keywords) {
    for (const keyword of keywords) {
      const idx = columnsUpper.findIndex(col => col.includes(keyword));
      if (idx !== -1) return columns[idx];
    }
    return null;
  }

  /**
   * Generar hash único del template basado en column_mapping
   */
  generateTemplateHash(columnMapping) {
    const hashInput = JSON.stringify(columnMapping, Object.keys(columnMapping).sort());
    return crypto.createHash('md5').update(hashInput).digest('hex');
  }

  /**
   * Buscar template por hash
   */
  async findTemplateByHash(templateHash) {
    const { data, error } = await supabaseService.supabase
      .from('bank_templates')
      .select('*')
      .eq('template_hash', templateHash)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Detectar formato de fecha
   */
  detectDateFormat(structuredData, dateColumn) {
    if (!dateColumn) return 'YYYY-MM-DD';

    const sampleDates = structuredData
      .slice(0, 5)
      .map(row => row[dateColumn])
      .filter(d => d);

    if (sampleDates.length === 0) return 'YYYY-MM-DD';

    const firstDate = sampleDates[0].toString();

    // Detectar formato DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(firstDate)) return 'DD/MM/YYYY';

    // Detectar formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(firstDate)) return 'YYYY-MM-DD';

    // Detectar número serial de Excel
    if (!isNaN(firstDate) && firstDate > 25569) return 'EXCEL_SERIAL';

    return 'YYYY-MM-DD';
  }

  /**
   * Detectar formato de montos
   */
  detectAmountFormat(structuredData, amountColumn) {
    if (!amountColumn) return 'standard';

    const sampleAmounts = structuredData
      .slice(0, 10)
      .map(row => row[amountColumn])
      .filter(a => a);

    if (sampleAmounts.length === 0) return 'standard';

    // Contar formatos
    let argentineCount = 0;
    let standardCount = 0;

    for (const amount of sampleAmounts) {
      const str = amount.toString();

      // Formato argentino: 1.234,56 (punto miles, coma decimal)
      if (/\d+\.\d{3},\d{2}/.test(str)) argentineCount++;

      // Formato estándar: 1,234.56 (coma miles, punto decimal)
      if (/\d+,\d{3}\.\d{2}/.test(str)) standardCount++;
    }

    return argentineCount > standardCount ? 'argentine' : 'standard';
  }

  /**
   * Generar patrones de detección para identificar archivos que matchean este template
   */
  generateDetectionPatterns(structuredData, columnMapping) {
    const columns = Object.keys(structuredData[0] || {});
    const columnsUpper = columns.map(c => c.toUpperCase());

    const requiredColumns = [];
    const optionalColumns = [];
    const columnPatterns = {};

    // Clasificar columnas como requeridas u opcionales
    if (columnMapping.date_column) {
      requiredColumns.push('date');
      columnPatterns.date = [columnMapping.date_column, columnMapping.date_column.toUpperCase()];
    }

    if (columnMapping.amount_column) {
      requiredColumns.push('amount');
      columnPatterns.amount = [columnMapping.amount_column, columnMapping.amount_column.toUpperCase()];
    }

    if (columnMapping.debit_column && columnMapping.credit_column) {
      requiredColumns.push('debit', 'credit');
      columnPatterns.debit = [columnMapping.debit_column];
      columnPatterns.credit = [columnMapping.credit_column];
    }

    if (columnMapping.description_column) {
      optionalColumns.push('description');
      columnPatterns.description = [columnMapping.description_column];
    }

    if (columnMapping.balance_column) {
      optionalColumns.push('balance');
      columnPatterns.balance = [columnMapping.balance_column];
    }

    if (columnMapping.reference_column) {
      optionalColumns.push('reference');
      columnPatterns.reference = [columnMapping.reference_column];
    }

    return {
      required_columns: requiredColumns,
      optional_columns: optionalColumns,
      column_patterns: columnPatterns,
      total_columns: columns.length,
      column_names_upper: columnsUpper
    };
  }

  /**
   * Analizar patrones en descripciones
   */
  analyzeDescriptionPatterns(transactions) {
    const prefixes = new Set();
    const keywords = new Set();

    for (const tx of transactions.slice(0, 20)) {
      if (!tx.description) continue;

      const desc = tx.description;

      // Detectar prefijos comunes
      const prefixMatch = desc.match(/^([A-Z][a-z]+(?:\s+[a-z]+)?)\s+(?:en|de|a)\s+/i);
      if (prefixMatch) prefixes.add(prefixMatch[1]);

      // Detectar keywords
      if (/cuota\s+\d+/i.test(desc)) keywords.add('CUOTA');
      if (/reverso/i.test(desc)) keywords.add('REVERSO');
      if (/débito automático/i.test(desc)) keywords.add('DEBITO_AUTOMATICO');
      if (/transferencia/i.test(desc)) keywords.add('TRANSFERENCIA');
      if (/compra/i.test(desc)) keywords.add('COMPRA');
    }

    return {
      prefixes: Array.from(prefixes),
      keywords: Array.from(keywords),
      merchant_extraction_regex: '^(.+?)\\s+-\\s+'
    };
  }

  /**
   * Extraer metadata del documento
   */
  extractDocumentMetadata(extractionResult, structuredData) {
    const metadata = {
      has_header_row: true,
      skip_rows: 0
    };

    // Metadata de Claude si está disponible
    if (extractionResult.documentMetadata) {
      if (extractionResult.documentMetadata.numero_cuenta) {
        metadata.account_number_sample = extractionResult.documentMetadata.numero_cuenta;
      }
      if (extractionResult.documentMetadata.periodo) {
        metadata.statement_period_sample = extractionResult.documentMetadata.periodo;
      }
    }

    return metadata;
  }

  /**
   * Crear template en base de datos
   */
  async createTemplate(templateData) {
    const { data, error } = await supabaseService.supabase
      .from('bank_templates')
      .insert(templateData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Actualizar estadísticas de uso de un template
   */
  async updateTemplateStats(templateId, success, confidenceScore) {
    // Obtener stats actuales
    const { data: template } = await supabaseService.supabase
      .from('bank_templates')
      .select('usage_count, success_rate, avg_confidence')
      .eq('id', templateId)
      .single();

    if (!template) return;

    const newUsageCount = template.usage_count + 1;
    const newSuccessCount = success
      ? Math.round((template.success_rate / 100) * template.usage_count) + 1
      : Math.round((template.success_rate / 100) * template.usage_count);

    const newSuccessRate = (newSuccessCount / newUsageCount) * 100;

    // Calcular nuevo promedio de confianza (si fue exitoso)
    const newAvgConfidence = success
      ? ((template.avg_confidence * template.usage_count) + confidenceScore) / newUsageCount
      : template.avg_confidence;

    await supabaseService.supabase
      .from('bank_templates')
      .update({
        usage_count: newUsageCount,
        success_rate: newSuccessRate,
        avg_confidence: newAvgConfidence,
        last_used_at: new Date().toISOString()
      })
      .eq('id', templateId);

    console.log(`[Template Learning] Stats actualizadas para template ${templateId}: ${newUsageCount} usos, ${newSuccessRate.toFixed(1)}% éxito`);
  }

  /**
   * Buscar template que matchee con datos estructurados
   * @param {Array<Object>} structuredData - Datos del archivo
   * @param {string} bankId - ID del banco detectado
   * @returns {Promise<Object|null>} Template encontrado o null
   */
  async findMatchingTemplate(structuredData, bankId) {
    if (!structuredData || structuredData.length === 0) return null;

    const columns = Object.keys(structuredData[0]);
    const columnsUpper = columns.map(c => c.toUpperCase());

    // Buscar templates del banco
    const { data: templates, error } = await supabaseService.supabase
      .from('bank_templates')
      .select('*')
      .eq('bank_id', bankId)
      .order('success_rate', { ascending: false })
      .order('usage_count', { ascending: false });

    if (error || !templates || templates.length === 0) {
      console.log(`[Template Learning] No hay templates para banco: ${bankId}`);
      return null;
    }

    console.log(`[Template Learning] Buscando match en ${templates.length} templates para ${bankId}`);

    // Intentar matchear cada template
    for (const template of templates) {
      const patterns = template.detection_patterns;
      let matchScore = 0;
      let maxScore = 0;

      // Verificar columnas requeridas
      for (const reqCol of patterns.required_columns) {
        maxScore += 2;
        const columnPatterns = patterns.column_patterns[reqCol] || [];
        const found = columnPatterns.some(pattern =>
          columnsUpper.some(col => col.includes(pattern.toUpperCase()))
        );
        if (found) matchScore += 2;
      }

      // Verificar columnas opcionales
      for (const optCol of patterns.optional_columns) {
        maxScore += 1;
        const columnPatterns = patterns.column_patterns[optCol] || [];
        const found = columnPatterns.some(pattern =>
          columnsUpper.some(col => col.includes(pattern.toUpperCase()))
        );
        if (found) matchScore += 1;
      }

      // Calcular score porcentual
      const scorePercent = maxScore > 0 ? (matchScore / maxScore) * 100 : 0;

      console.log(`[Template Learning] Template ${template.id}: ${scorePercent.toFixed(1)}% match`);

      // Si match > 80%, usar este template
      if (scorePercent >= 80) {
        console.log(`[Template Learning] ✅ Template encontrado: ${template.bank_name} (ID: ${template.id})`);
        return template;
      }
    }

    console.log(`[Template Learning] No se encontró template con match > 80%`);
    return null;
  }

  /**
   * Aplicar template para extraer transacciones
   * @param {Object} template - Template a aplicar
   * @param {Array<Object>} structuredData - Datos estructurados
   * @returns {Object} Resultado de extracción
   */
  applyTemplate(template, structuredData) {
    console.log(`[Template Learning] Aplicando template ${template.id} (${template.bank_name})`);

    const transactions = [];
    const mapping = template.column_mapping;

    for (const row of structuredData) {
      // Skip empty rows
      if (Object.values(row).every(val => !val || val.toString().trim() === '')) {
        continue;
      }

      // Extraer campos según mapping
      const date = row[mapping.date_column];
      const description = mapping.description_column ? row[mapping.description_column] : '';
      const reference = mapping.reference_column ? row[mapping.reference_column] : null;
      const balance = mapping.balance_column ? row[mapping.balance_column] : null;

      // Calcular monto
      let amount = 0;
      if (mapping.debit_column && mapping.credit_column) {
        // Estilo Hipotecario: columnas separadas
        const debit = this.parseAmount(row[mapping.debit_column], template.amount_format);
        const credit = this.parseAmount(row[mapping.credit_column], template.amount_format);
        amount = credit > 0 ? credit : -debit;
      } else if (mapping.amount_column) {
        // Estilo Santander: columna única con signo
        amount = this.parseAmount(row[mapping.amount_column], template.amount_format);
      }

      // Skip si no hay fecha o monto
      if (!date || amount === 0) continue;

      // Parse fecha
      const parsedDate = this.parseDate(date, template.date_format);
      if (!parsedDate) continue;

      // Generar timestamp
      const dateTime = new Date(parsedDate + 'T12:00:00Z').toISOString();

      transactions.push({
        transaction_date: parsedDate,
        transaction_datetime: dateTime,
        description: description || 'Unknown',
        merchant: this.extractMerchant(description, template.description_patterns),
        amount: amount,
        transaction_type: amount < 0 ? 'debit' : 'credit',
        reference_number: reference ? reference.toString() : null,
        balance: balance ? this.parseAmount(balance, template.amount_format) : null,
        raw_data: row,
        confidence_score: template.avg_confidence || 85.0
      });
    }

    console.log(`[Template Learning] Extraídas ${transactions.length} transacciones con template`);

    return {
      transactions,
      bankName: template.bank_name,
      statementDate: transactions.length > 0 ? transactions[0].transaction_date : null,
      confidenceScore: template.avg_confidence || 85.0,
      totalTransactions: transactions.length,
      processingMethod: 'template_learned'
    };
  }

  /**
   * Parse amount según formato
   */
  parseAmount(value, format) {
    if (typeof value === 'number') return value;
    if (!value || value.toString().trim() === '') return 0;

    let cleaned = value.toString().trim().replace(/[$\s]/g, '');
    const isNegative = cleaned.startsWith('-') || (cleaned.startsWith('(') && cleaned.endsWith(')'));
    cleaned = cleaned.replace(/[-()]/g, '');

    if (format === 'argentine') {
      // Formato argentino: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato estándar: 1,234.56
      cleaned = cleaned.replace(/,/g, '');
    }

    const amount = parseFloat(cleaned);
    if (isNaN(amount)) return 0;

    return isNegative ? -amount : amount;
  }

  /**
   * Parse date según formato
   */
  parseDate(dateValue, format) {
    if (!dateValue) return null;
    const dateStr = dateValue.toString().trim();

    if (format === 'YYYY-MM-DD' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    if (format === 'DD/MM/YYYY' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
      const [day, month, year] = dateStr.split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    if (format === 'EXCEL_SERIAL' && !isNaN(dateValue) && dateValue > 25569) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + dateValue * 86400000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return null;
  }

  /**
   * Extraer merchant usando patrones del template
   */
  extractMerchant(description, patterns) {
    if (!description) return null;

    let merchant = description
      .replace(/cuota \d+ de \d+/gi, '')
      .replace(/reverso\s*-?\s*/gi, '')
      .trim();

    // Aplicar regex del template si existe
    if (patterns && patterns.merchant_extraction_regex) {
      const regex = new RegExp(patterns.merchant_extraction_regex, 'i');
      const match = merchant.match(regex);
      if (match && match[1]) return match[1].trim();
    }

    // Fallback: tomar primera parte
    const parts = merchant.split(/\s+-\s+/);
    return parts[0] || merchant;
  }
}

module.exports = new TemplateLearningService();
