/**
 * Transaction Extractor Service
 * Uses local OCR and pattern matching for extraction
 */

const localOcrService = require('./local-ocr.service');

class ExtractorService {
  /**
   * Extract transactions from parsed text content
   * @param {string} textContent - Parsed text from PDF/CSV/XLSX
   * @param {Array<Object>} structuredData - Structured data (for CSV/XLSX)
   * @param {string} fileName - Original file name
   * @returns {Promise<Object>} Extraction result with transactions and metadata
   */
  async extractTransactions(textContent, structuredData, fileName) {
    try {
      console.log('[Extractor] Starting extraction...');

      // Try structured data first (CSV/XLSX)
      if (structuredData && structuredData.length > 0) {
        console.log('[Extractor] Using structured data extraction (CSV/XLSX)');
        const result = this.extractFromStructuredData(structuredData);

        // Calculate confidence score
        const confidenceScore = this.calculateConfidenceScore(result.transactions, textContent);

        return {
          transactions: result.transactions,
          bankName: result.bankName,
          statementDate: result.statementDate,
          confidenceScore,
          totalTransactions: result.transactions.length
        };
      }

      // Use local OCR service for text-based extraction (PDF)
      console.log('[Extractor] Using local OCR extraction for text');
      const result = await localOcrService.extractTransactions(textContent, fileName);
      console.log(`[Extractor] Local OCR extracted ${result.totalTransactions} transactions`);

      return result;
    } catch (error) {
      console.error('[Extractor] Extraction error:', error);
      throw new Error(`Failed to extract transactions: ${error.message}`);
    }
  }

  /**
   * Extract transactions from structured data (CSV/XLSX)
   * @param {Array<Object>} data
   * @returns {Object}
   */
  extractFromStructuredData(data) {
    // Check if this is Hipotecario CSV format
    if (data.length > 0) {
      const firstRow = data[0];
      const keys = Object.keys(firstRow).map(k => k.toUpperCase());

      // Debug: Log the columns detected
      console.log('[Extractor] Detected columns:', Object.keys(firstRow));
      console.log('[Extractor] First row sample:', JSON.stringify(firstRow).substring(0, 500));

      // Detect Hipotecario format: FECHA, DESCRIPCION, DEBITO EN $, CREDITO EN $
      if (keys.some(k => k.includes('DEBITO EN')) && keys.some(k => k.includes('CREDITO EN'))) {
        console.log('[Extractor] Detected Hipotecario CSV format');
        return this.extractHipotecarioCSV(data);
      }

      // Detect Santander format: Check for key Santander columns
      // Variations:
      // - Old format: "Importe Pesos", "Saldo Pesos", "Cod. Operativo", "Concepto"
      // - New format: "Importe", "Saldo", "Cod. Operativo", "Concepto", "Referencia"
      const hasImporte = keys.some(k => k.includes('IMPORTE'));
      const hasSaldo = keys.some(k => k.includes('SALDO'));
      const hasConcepto = keys.some(k => k === 'CONCEPTO' || k.includes('CONCEPTO'));
      const hasCodOperativo = keys.some(k => k.includes('COD') && k.includes('OPERATIVO'));

      // If it has Importe + Saldo + (Concepto OR CodOperativo), it's likely Santander
      const hasSantanderColumns = hasImporte && hasSaldo && (hasConcepto || hasCodOperativo);

      if (hasSantanderColumns) {
        console.log('[Extractor] Detected Santander CSV format');
        return this.extractSantanderCSV(data);
      }
    }

    const transactions = [];
    let bankName = null;
    let statementDate = null;

    // Common column name variations
    const dateColumns = ['fecha', 'date', 'transaction date', 'transaction_date', 'fecha de transacción'];
    const descColumns = ['descripcion', 'descripción', 'description', 'merchant', 'comercio', 'detalle'];
    const amountColumns = ['monto', 'amount', 'importe', 'pesos', 'valor', 'total'];
    const refColumns = ['referencia', 'reference', 'ref', '#ref', 'numero'];

    for (const row of data) {
      // Skip empty rows
      if (Object.values(row).every(val => !val || val.toString().trim() === '')) {
        continue;
      }

      // Find column matches (case-insensitive)
      const keys = Object.keys(row).map(k => k.toLowerCase());
      const dateKey = keys.find(k => dateColumns.some(col => k.includes(col)));
      const descKey = keys.find(k => descColumns.some(col => k.includes(col)));
      const amountKey = keys.find(k => amountColumns.some(col => k.includes(col)));
      const refKey = keys.find(k => refColumns.some(col => k.includes(col)));

      // Get original keys (with proper casing)
      const originalKeys = Object.keys(row);
      const dateField = originalKeys[keys.indexOf(dateKey)];
      const descField = originalKeys[keys.indexOf(descKey)];
      const amountField = originalKeys[keys.indexOf(amountKey)];
      const refField = refKey ? originalKeys[keys.indexOf(refKey)] : null;

      // Extract transaction if we have at least date and amount
      if (dateField && amountField && row[dateField] && row[amountField]) {
        const transaction = this.normalizeTransaction({
          date: row[dateField],
          description: descField ? row[descField] : '',
          amount: row[amountField],
          reference: refField ? row[refField] : null,
          rawData: row
        });

        if (transaction) {
          transactions.push(transaction);
        }
      }
    }

    return { transactions, bankName, statementDate };
  }

  /**
   * Extract transactions from Hipotecario CSV format
   * Columns: FECHA, DESCRIPCION, SUCURSAL, REFERENCIA, DEBITO EN $, CREDITO EN $, SALDO EN $
   * @param {Array<Object>} data
   * @returns {Object}
   */
  extractHipotecarioCSV(data) {
    const transactions = [];

    console.log(`[Extractor] Hipotecario CSV: Processing ${data.length} rows`);

    for (const row of data) {
      // Skip empty rows
      if (Object.values(row).every(val => !val || val.toString().trim() === '')) {
        continue;
      }

      // Find columns (case-insensitive match)
      const keys = Object.keys(row);
      const dateField = keys.find(k => k.toUpperCase() === 'FECHA');
      const descField = keys.find(k => k.toUpperCase() === 'DESCRIPCION');
      const refField = keys.find(k => k.toUpperCase() === 'REFERENCIA');
      const debitField = keys.find(k => k.toUpperCase().includes('DEBITO'));
      const creditField = keys.find(k => k.toUpperCase().includes('CREDITO'));
      const balanceField = keys.find(k => k.toUpperCase().includes('SALDO'));

      // Skip if no date or if it's a summary/total row
      if (!dateField || !row[dateField]) continue;

      // Skip rows with "Total:" or disclaimer text
      const dateValue = row[dateField].toString().trim();
      if (dateValue === '' || dateValue.toLowerCase().includes('total') || dateValue.toLowerCase().includes('presente documento')) {
        continue;
      }

      // Debug: log the raw date value from XLSX
      console.log(`[Extractor] Hipotecario raw date field: "${row[dateField]}" (type: ${typeof row[dateField]})`);

      const date = this.parseDate(row[dateField]);
      if (!date) {
        console.log(`[Extractor] Hipotecario CSV: Skipping row due to invalid date: "${row[dateField]}"`);
        continue;
      }

      const description = descField ? row[descField] : '';
      const reference = refField ? row[refField] : null;

      // Parse debit and credit amounts (Argentine format: 1.234,56)
      const debit = debitField ? this.parseArgentineAmount(row[debitField]) : 0;
      const credit = creditField ? this.parseArgentineAmount(row[creditField]) : 0;
      const balance = balanceField ? this.parseArgentineAmount(row[balanceField]) : null;

      // Calculate final amount: credit is positive, debit is negative
      let amount = 0;
      if (credit > 0) {
        amount = credit;
      } else if (debit > 0) {
        amount = -debit;
      }

      // Skip if no amount
      if (amount === 0) continue;

      console.log(`[Extractor] Hipotecario CSV: ${date} | ${description.substring(0, 40)}... | ${amount}`);

      // Generate timestamp - for files use noon UTC as default
      const dateTime = new Date(date + 'T12:00:00Z').toISOString();

      transactions.push({
        transaction_date: date, // Keep for backwards compatibility
        transaction_datetime: dateTime, // New field with timestamp
        description: description || 'Unknown',
        merchant: this.extractMerchant(description),
        amount: amount,
        transaction_type: amount < 0 ? 'debit' : 'credit',
        reference_number: reference ? reference.toString() : null,
        balance: balance,
        raw_data: row,
        confidence_score: 90.0 // High confidence for direct CSV parsing
      });
    }

    console.log(`[Extractor] Hipotecario CSV: Found ${transactions.length} transactions`);
    return {
      transactions,
      bankName: 'Banco Hipotecario',
      statementDate: transactions.length > 0 ? transactions[0].transaction_date : null
    };
  }

  /**
   * Extract transactions from Santander CSV format
   * Columns: Fecha, Suc. Origen, Desc. Sucursal, Cod. Operativo, Referencia, Concepto, Importe Pesos, Saldo Pesos
   * @param {Array<Object>} data
   * @returns {Object}
   */
  extractSantanderCSV(data) {
    const transactions = [];

    console.log(`[Extractor] Santander CSV: Processing ${data.length} rows`);

    for (const row of data) {
      // Skip empty rows
      if (Object.values(row).every(val => !val || val.toString().trim() === '')) {
        continue;
      }

      // Find columns (case-insensitive match)
      const keys = Object.keys(row);
      const dateField = keys.find(k => k.toUpperCase() === 'FECHA');
      const branchField = keys.find(k => k.toUpperCase().includes('SUC'));
      const branchDescField = keys.find(k => k.toUpperCase().includes('DESC. SUCURSAL'));
      const operativeCodeField = keys.find(k => k.toUpperCase().includes('COD. OPERATIVO') || k.toUpperCase().includes('COD OPERATIVO'));
      const refField = keys.find(k => k.toUpperCase() === 'REFERENCIA');
      const conceptField = keys.find(k => k.toUpperCase() === 'CONCEPTO');
      const amountField = keys.find(k => k.toUpperCase().includes('IMPORTE PESOS') || k.toUpperCase() === 'IMPORTE');
      const balanceField = keys.find(k => k.toUpperCase().includes('SALDO PESOS') || k.toUpperCase() === 'SALDO');

      // Skip if no date or if it's a summary/total row
      if (!dateField || !row[dateField]) continue;

      // Skip rows with "Total:" or disclaimer text
      const dateValue = row[dateField].toString().trim();
      if (dateValue === '' || dateValue.toLowerCase().includes('total') || dateValue.toLowerCase().includes('presente documento')) {
        continue;
      }

      // Debug: log the raw date value from XLSX
      console.log(`[Extractor] Santander raw date field: "${row[dateField]}" (type: ${typeof row[dateField]})`);

      const date = this.parseDate(row[dateField]);
      if (!date) {
        console.log(`[Extractor] Santander CSV: Skipping row due to invalid date: "${row[dateField]}"`);
        continue;
      }

      // Build description from Concepto (main description)
      const concept = conceptField ? row[conceptField] : '';
      const branchDesc = branchDescField ? row[branchDescField] : '';
      const description = concept || branchDesc || 'Sin descripción';

      const reference = refField ? row[refField] : null;
      const operativeCode = operativeCodeField ? row[operativeCodeField] : null;

      // Parse amount (Argentine format, can be negative like -343,65)
      const rawAmount = amountField ? row[amountField] : 0;
      console.log(`[Extractor] Santander raw amount: "${rawAmount}" (type: ${typeof rawAmount})`);
      const amount = this.parseArgentineAmount(rawAmount);
      console.log(`[Extractor] Santander parsed amount: ${amount}`);
      const balance = balanceField ? this.parseArgentineAmount(row[balanceField]) : null;

      // Skip if no amount
      if (amount === 0) continue;

      console.log(`[Extractor] Santander CSV: ${date} | ${description.substring(0, 40)}... | ${amount}`);

      // Generate timestamp - for files use noon UTC as default
      const dateTime2 = new Date(date + 'T12:00:00Z').toISOString();

      transactions.push({
        transaction_date: date, // Keep for backwards compatibility
        transaction_datetime: dateTime2, // New field with timestamp
        description: description,
        merchant: this.extractMerchant(description),
        amount: amount,
        transaction_type: amount < 0 ? 'debit' : 'credit',
        reference_number: reference ? reference.toString() : (operativeCode ? operativeCode.toString() : null),
        balance: balance,
        raw_data: row,
        confidence_score: 90.0 // High confidence for direct CSV parsing
      });
    }

    console.log(`[Extractor] Santander CSV: Found ${transactions.length} transactions`);
    return {
      transactions,
      bankName: 'Banco Santander',
      statementDate: transactions.length > 0 ? transactions[0].transaction_date : null
    };
  }

  /**
   * Parse Argentine number format (1.234,56 -> 1234.56)
   * @param {string|number} value
   * @returns {number}
   */
  parseArgentineAmount(value) {
    // If already a number, return as-is
    if (typeof value === 'number') {
      console.log(`[Extractor] parseArgentineAmount: got number ${value}, returning as-is`);
      return value;
    }

    if (!value || value.toString().trim() === '') return 0;

    let cleaned = value.toString().trim();
    console.log(`[Extractor] parseArgentineAmount: processing string "${cleaned}"`);

    // Remove currency symbols and spaces
    cleaned = cleaned.replace(/[$\s]/g, '');

    // Check for negative (parentheses or minus)
    const isNegative = cleaned.startsWith('-') || (cleaned.startsWith('(') && cleaned.endsWith(')'));
    cleaned = cleaned.replace(/[-()]/g, '');

    // Auto-detect format by looking at the last occurrence of . and ,
    // Argentine format: 1.234,56 (dot=thousands, comma=decimal)
    // Standard format: 1,234.56 or 1234.56 (comma=thousands, dot=decimal)

    const lastDotIndex = cleaned.lastIndexOf('.');
    const lastCommaIndex = cleaned.lastIndexOf(',');

    // If both exist, the one that comes last is the decimal separator
    if (lastDotIndex > -1 && lastCommaIndex > -1) {
      if (lastCommaIndex > lastDotIndex) {
        // Argentine format: comma comes after dot → 1.234,56
        console.log(`[Extractor] parseArgentineAmount: detected ARGENTINE format (dot before comma)`);
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        // Standard format: dot comes after comma → 1,234.56
        console.log(`[Extractor] parseArgentineAmount: detected STANDARD format (comma before dot)`);
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (lastCommaIndex > -1) {
      // Only comma exists - check if it's decimal or thousands
      // If there are 3 digits after comma, it's thousands separator
      // If there are 1-2 digits after comma, it's decimal separator
      const digitsAfterComma = cleaned.substring(lastCommaIndex + 1).length;
      if (digitsAfterComma === 3) {
        // Thousands separator: 1,234 → remove comma
        console.log(`[Extractor] parseArgentineAmount: comma is thousands separator (3 digits after)`);
        cleaned = cleaned.replace(',', '');
      } else {
        // Decimal separator: 1,56 → replace with dot
        console.log(`[Extractor] parseArgentineAmount: comma is decimal separator (${digitsAfterComma} digits after)`);
        cleaned = cleaned.replace(',', '.');
      }
    } else if (lastDotIndex > -1) {
      // Only dot exists - check if it's decimal or thousands
      const digitsAfterDot = cleaned.substring(lastDotIndex + 1).length;
      if (digitsAfterDot === 3 && lastDotIndex > 0) {
        // Thousands separator: 1.234 → remove dot
        console.log(`[Extractor] parseArgentineAmount: dot is thousands separator (3 digits after)`);
        cleaned = cleaned.replace('.', '');
      } else {
        // Decimal separator: 1.56 or 1.1536 → keep dot
        console.log(`[Extractor] parseArgentineAmount: dot is decimal separator (${digitsAfterDot} digits after)`);
        // No changes needed
      }
    }

    console.log(`[Extractor] parseArgentineAmount: cleaned string "${cleaned}"`);

    const amount = parseFloat(cleaned);
    if (isNaN(amount)) {
      console.log(`[Extractor] parseArgentineAmount: FAILED to parse, returning 0`);
      return 0;
    }

    const result = isNegative ? -amount : amount;
    console.log(`[Extractor] parseArgentineAmount: final result ${result}`);
    return result;
  }


  /**
   * Normalize a single transaction
   * @param {Object} rawTransaction
   * @returns {Object|null}
   */
  normalizeTransaction(rawTransaction) {
    try {
      // Parse date
      const date = this.parseDate(rawTransaction.date);
      if (!date) return null;

      // Parse amount
      const amount = this.parseAmount(rawTransaction.amount);
      if (amount === null) return null;

      // Determine transaction type
      const transactionType = amount < 0 ? 'debit' : 'credit';

      // Generate timestamp - for files we don't have time, so use noon UTC as default
      const dateTime = new Date(date + 'T12:00:00Z').toISOString();

      return {
        transaction_date: date, // Keep for backwards compatibility (YYYY-MM-DD)
        transaction_datetime: dateTime, // New field with timestamp (noon UTC for files)
        description: rawTransaction.description || 'Unknown',
        merchant: this.extractMerchant(rawTransaction.description),
        amount: amount,
        transaction_type: transactionType,
        reference_number: rawTransaction.reference ? rawTransaction.reference.toString() : null,
        raw_data: rawTransaction.rawData,
        confidence_score: 85.0 // Default confidence for rule-based extraction
      };
    } catch (error) {
      console.error('Transaction normalization error:', error);
      return null;
    }
  }

  /**
   * Parse date string to ISO format
   * @param {string} dateString
   * @returns {string|null}
   */
  parseDate(dateString) {
    if (!dateString) return null;

    try {
      // Convert to string if it's not already
      const dateStr = dateString.toString().trim();

      console.log(`[Extractor] parseDate input: "${dateStr}" (type: ${typeof dateString})`);

      // Handle YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        console.log(`[Extractor] parseDate matched YYYY-MM-DD format`);
        return dateStr;
      }

      // Handle DD/MM/YYYY format (Argentine/European style)
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('/');
        const paddedDay = day.padStart(2, '0');
        const paddedMonth = month.padStart(2, '0');
        const result = `${year}-${paddedMonth}-${paddedDay}`;
        console.log(`[Extractor] parseDate matched DD/MM/YYYY format, result: ${result}`);
        return result;
      }

      // Handle DD-MM-YYYY format
      if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('-');
        const paddedDay = day.padStart(2, '0');
        const paddedMonth = month.padStart(2, '0');
        const result = `${year}-${paddedMonth}-${paddedDay}`;
        console.log(`[Extractor] parseDate matched DD-MM-YYYY format, result: ${result}`);
        return result;
      }

      // Handle Excel serial date numbers (numbers that represent dates)
      if (!isNaN(dateString) && dateString > 25569) { // Excel epoch starts at 1900-01-01 (25569 is Unix epoch)
        const excelEpoch = new Date(1899, 11, 30); // Excel's epoch date
        const date = new Date(excelEpoch.getTime() + dateString * 86400000); // Convert days to milliseconds
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const result = `${year}-${month}-${day}`;
        console.log(`[Extractor] parseDate matched Excel serial number, result: ${result}`);
        return result;
      }

      // Handle ISO 8601 format (YYYY-MM-DDTHH:MM:SS)
      if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) {
        const result = dateStr.split('T')[0];
        console.log(`[Extractor] parseDate matched ISO 8601 format: "${dateStr}" -> ${result}`);
        return result;
      }

      // DO NOT use new Date() fallback - it interprets DD/MM as MM/DD (US format)
      // If we reach here, the format is not supported
      console.log(`[Extractor] parseDate FAILED - unsupported format: "${dateStr}"`);
      return null;
    } catch (error) {
      console.error(`[Extractor] parseDate error:`, error);
      return null;
    }
  }

  /**
   * Parse amount string to number
   * @param {string|number} amountString
   * @returns {number|null}
   */
  parseAmount(amountString) {
    if (typeof amountString === 'number') return amountString;
    if (!amountString) return null;

    try {
      // Remove currency symbols and spaces
      let cleaned = amountString.toString()
        .replace(/[$\s]/g, '')
        .replace(/[.,](?=\d{3})/g, '') // Remove thousands separators
        .replace(',', '.'); // Convert decimal comma to dot

      // Handle negative amounts (with or without minus sign)
      const isNegative = cleaned.includes('-');
      cleaned = cleaned.replace('-', '');

      const amount = parseFloat(cleaned);
      if (isNaN(amount)) return null;

      return isNegative ? -Math.abs(amount) : amount;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract merchant name from description
   * @param {string} description
   * @returns {string|null}
   */
  extractMerchant(description) {
    if (!description) return null;

    // Remove common prefixes/suffixes
    let merchant = description
      .replace(/cuota \d+ de \d+/gi, '')
      .replace(/reverso\s*-?\s*/gi, '')
      .replace(/^-\s*/, '')
      .trim();

    // Take first meaningful part
    const parts = merchant.split(/\s+-\s+/);
    return parts[0] || merchant;
  }

  /**
   * Calculate confidence score based on extraction quality
   * @param {Array} transactions
   * @param {string} textContent
   * @returns {number}
   */
  calculateConfidenceScore(transactions, textContent) {
    if (transactions.length === 0) return 0;

    let score = 50; // Base score

    // Add points for having transactions
    score += Math.min(transactions.length * 2, 20);

    // Add points if all transactions have dates
    const withDates = transactions.filter(t => t.transaction_date).length;
    score += (withDates / transactions.length) * 10;

    // Add points if all transactions have amounts
    const withAmounts = transactions.filter(t => t.amount !== null && t.amount !== undefined).length;
    score += (withAmounts / transactions.length) * 10;

    // Add points if descriptions are meaningful
    const withDescriptions = transactions.filter(t => t.description && t.description.length > 3).length;
    score += (withDescriptions / transactions.length) * 10;

    return Math.min(Math.round(score), 100);
  }
}

module.exports = new ExtractorService();
