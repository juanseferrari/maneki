/**
 * Local OCR Service
 * Uses pattern matching and rule-based extraction to parse bank statements
 * No external API calls - completely local processing
 */
class LocalOcrService {
  constructor() {
    this.bankPatterns = {
      hipotecario: {
        name: 'Banco Hipotecario',
        patterns: {
          // Match the header to confirm it's Hipotecario
          header: /Hipotecario|hipotecario/i,
          // Match account number format
          accountNumber: /CTE\s*\$\s*\*+(\d+)/i,
          // Match date range
          dateRange: /Movimientos?\s+del\s+(\d{2}\/\d{2}\/\d{4})\s+al\s+(\d{2}\/\d{2}\/\d{4})/i,
          statementDate: /Movimientos?\s+del\s+\d{2}\/\d{2}\/\d{4}\s+al\s+(\d{2}\/\d{2}\/\d{4})/i
        }
      },
      brubank: {
        name: 'Brubank',
        patterns: {
          transaction: /(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(.+?)\s+([-]?\$?\s*[\d,]+\.?\d*)/g,
          reverso: /(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+Reverso\s*-?\s*(.+?)\s+([-]?\$?\s*[\d,]+\.?\d*)/gi,
          statementDate: /(?:Estado de Cuenta|Estado del)\s+(?:del?\s+)?(\d{2}\/\d{2}\/\d{4})/i,
          balance: /Saldo\s+(?:Final|Actual)?\s*:?\s*\$?\s*([\d,]+\.?\d*)/i
        }
      },
      santander: {
        name: 'Santander',
        patterns: {
          transaction: /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-]?\$?\s*[\d,]+\.?\d*)\s*$/gm,
          statementDate: /(?:Resumen|Estado)\s+(?:del?\s+)?(\d{2}\/\d{2}\/\d{4})/i,
          balance: /Saldo\s+(?:Final|Actual)?\s*:?\s*\$?\s*([\d,]+\.?\d*)/i
        }
      },
      generic: {
        name: 'Generic',
        patterns: {
          date: /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/g,
          amount: /([-]?\$?\s*[\d,]+\.?\d{2})/g,
          keywords: /(?:compra|pago|transferencia|débito|crédito|extracción|depósito)/gi
        }
      }
    };

    // CUIT patterns for extraction from descriptions
    this.cuitPattern = /(?:\|\s*)?(\d{11}|\d{2}-?\d{8}-?\d)\s+([A-Za-z\s.,]+(?:S\.?R\.?L\.?|S\.?A\.?|SAS|S\.?C\.?A\.?)?)/i;
  }

  /**
   * Detect which bank the statement is from
   * @param {string} text - Document text content
   * @returns {string} Bank identifier
   */
  detectBank(text) {
    const textLower = text.toLowerCase();

    // Detect credit card statements
    if (textLower.includes('ciclo de facturación') ||
        textLower.includes('resumen de cuenta') ||
        (textLower.includes('balance total') && textLower.includes('gastos en'))) {
      return 'credit_card';
    }

    // Detect Banco Hipotecario
    if (textLower.includes('hipotecario') || /CTE\s*\$\s*\*+\d+/i.test(text)) {
      return 'hipotecario';
    }

    if (textLower.includes('brubank') || textLower.includes('bru bank')) {
      return 'brubank';
    }

    if (textLower.includes('santander') || textLower.includes('banco santander')) {
      return 'santander';
    }

    if (textLower.includes('galicia')) {
      return 'galicia';
    }

    if (textLower.includes('bbva')) {
      return 'bbva';
    }

    return 'generic';
  }

  /**
   * Parse date from various formats
   * @param {string} dateStr - Date string
   * @returns {string} ISO date format (YYYY-MM-DD)
   */
  parseDate(dateStr) {
    if (!dateStr) return null;

    // Try DD/MM/YYYY format
    const ddmmyyyy = dateStr.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (ddmmyyyy) {
      return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    }

    // Try DD/MM/YY format
    const ddmmyy = dateStr.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{2})/);
    if (ddmmyy) {
      const year = parseInt(ddmmyy[3]) + 2000;
      return `${year}-${ddmmyy[2]}-${ddmmyy[1]}`;
    }

    // Try YYYY-MM-DD format (already correct)
    const yyyymmdd = dateStr.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
    if (yyyymmdd) {
      return dateStr;
    }

    return null;
  }

  /**
   * Parse amount from string - handles Argentine format (dots as thousands, comma as decimal)
   * @param {string} amountStr - Amount string
   * @returns {number} Parsed amount
   */
  parseAmount(amountStr) {
    if (!amountStr) return 0;

    // Remove currency symbols and spaces
    let cleaned = amountStr.toString().replace(/[$\s]/g, '');

    // Check if negative (starts with - or has parentheses)
    const isNegative = cleaned.startsWith('-') || (cleaned.startsWith('(') && cleaned.endsWith(')'));
    cleaned = cleaned.replace(/[-()]/g, '');

    // Detect Argentine format: 1.234,56 (dots for thousands, comma for decimal)
    // vs US format: 1,234.56 (commas for thousands, dot for decimal)
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    if (lastComma > lastDot && lastComma >= cleaned.length - 3) {
      // Argentine/European format: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma && lastDot >= cleaned.length - 3) {
      // US format: 1,234.56
      cleaned = cleaned.replace(/,/g, '');
    } else if (lastComma > -1 && lastDot === -1) {
      // Only comma, assume it's decimal: 1234,56
      cleaned = cleaned.replace(',', '.');
    } else if (lastDot > -1 && lastComma === -1) {
      // Only dot, check position
      if (lastDot >= cleaned.length - 3) {
        // It's a decimal: 1234.56
        // Keep as is
      } else {
        // It's thousands: 1.234
        cleaned = cleaned.replace(/\./g, '');
      }
    }

    const amount = parseFloat(cleaned);
    if (isNaN(amount)) return 0;

    return isNegative ? -Math.abs(amount) : amount;
  }

  /**
   * Extract CUIT and Razon Social from description
   * @param {string} description - Transaction description
   * @returns {Object} Extracted CUIT info
   */
  extractCuitInfo(description) {
    if (!description) return null;

    // Pattern 1: "N/C - RECIBISTE TRANSF. DEBIN MT | 30718553306 CAPOCANNONIERE S R L"
    // Pattern 2: "N/D - DEBITO TRANSF TERCEROS OB BH | 30500011072 BANCO HIPOTECARIO S A"
    // Pattern 3: "N/D - TRANSF ENV INMEDIATA COELSA | 20164256716 Felipe Orlando Segura"

    // Match CUIT (11 digits) followed by name
    const patterns = [
      /\|\s*(\d{11})\s+(.+?)(?:\s*$)/i,              // Format: | 30718553306 COMPANY NAME
      /\|\s*(\d{2}-\d{8}-\d)\s+(.+?)(?:\s*$)/i,      // Format: | 30-71855330-6 COMPANY NAME
      /(?:CUIT|C\.U\.I\.T\.?)\s*:?\s*(\d{2}-?\d{8}-?\d)\s*(.+?)(?:\s*$)/i  // Format: CUIT: 30-71855330-6 NAME
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        let cuit = match[1].replace(/-/g, '');
        // Format CUIT as XX-XXXXXXXX-X
        if (cuit.length === 11) {
          cuit = `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
        }

        return {
          cuit: cuit,
          razonSocial: match[2].trim()
        };
      }
    }

    return null;
  }

  /**
   * Extract merchant name from description
   * @param {string} description - Transaction description
   * @returns {string} Merchant name
   */
  extractMerchant(description) {
    if (!description) return null;

    // Remove common prefixes
    let merchant = description
      .replace(/^N\/[CD]\s*-\s*/gi, '')  // Remove N/C or N/D prefix
      .replace(/^(compra|pago|transferencia|débito|crédito)\s+/gi, '')
      .replace(/cuota \d+ de \d+/gi, '')
      .replace(/reverso\s*-?\s*/gi, '')
      .trim();

    // Take first part before pipe
    const parts = merchant.split(/\s*\|\s*/);
    merchant = parts[0] || merchant;

    // Take first part before dash
    const dashParts = merchant.split(/\s+-\s+/);
    merchant = dashParts[0] || merchant;

    // Limit length
    return merchant.substring(0, 100).trim();
  }

  /**
   * Parse transaction type from description prefix
   * @param {string} description - Transaction description
   * @returns {string} Transaction type (credit/debit)
   */
  parseTransactionType(description) {
    if (!description) return 'unknown';

    const descUpper = description.toUpperCase();

    // N/C = Nota de Crédito (credit)
    if (descUpper.startsWith('N/C')) return 'credit';

    // N/D = Nota de Débito (debit)
    if (descUpper.startsWith('N/D')) return 'debit';

    // Check for credit keywords
    if (descUpper.includes('ACRED') ||
        descUpper.includes('RECIB') ||
        descUpper.includes('DEPOSITO') ||
        descUpper.includes('CRÉDITO') ||
        descUpper.includes('CREDITO')) {
      return 'credit';
    }

    // Check for debit keywords
    if (descUpper.includes('DEBITO') ||
        descUpper.includes('ENVIASTE') ||
        descUpper.includes('PAGO') ||
        descUpper.includes('TRANSF ENV') ||
        descUpper.includes('EXTRACCION')) {
      return 'debit';
    }

    return 'unknown';
  }

  /**
   * Extract transactions from Banco Hipotecario statement
   * Format: DD/MM/YYYY | DESCRIPTION | IMPORTE_MONEDA | SALDO EN $
   * The PDF concatenates fields without spaces, so we need to parse from the end
   * @param {string} text - Document text
   * @returns {Array} Extracted transactions
   */
  extractHipotecarioTransactions(text) {
    const transactions = [];
    const lines = text.split('\n');

    console.log(`[LocalOCR] Hipotecario: Processing ${lines.length} lines`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines
      if (!line || line.length < 10) continue;

      // Skip header/footer lines
      if (line.includes('El presente documento no constituye') ||
          line.includes('Movimientos del') ||
          line.includes('Hipotecario') ||
          line.toLowerCase().includes('saldo en $') ||
          line.includes('FECHADESCRIPCIÓN') ||
          line.includes('IMPORTE_MON') ||
          line === 'Total:' ||
          line === 'TOTAL' ||
          line === 'EDA') {
        continue;
      }

      // Check if line starts with date DD/MM/YYYY
      const dateMatch = line.match(/^(\d{2}\/\d{2}\/\d{4})/);
      if (!dateMatch) continue;

      const date = dateMatch[1];
      let restOfLine = line.substring(10); // After DD/MM/YYYY (10 chars)

      // Strategy: Parse from the END of the line
      // The format is: DESCRIPTION + AMOUNT (with .XX decimals) + BALANCE (with .XX decimals)
      // Balance is always at the end, then amount before it

      // Find the last two decimal numbers (amount and balance)
      // Pattern: look for numbers ending in .XX from the end

      let description = '';
      let amount = 0;
      let matched = false;

      // Method 1: Find amount by looking for negative sign pattern at the end
      // Negative amounts: DESCRIPTION-AMOUNT.DDBALANCE.DD
      // Example: "MERPAGO*FERRESHOP - CAPITAL FE-47437.505960411.59"
      const negativePattern = restOfLine.match(/^(.+?)(-\d+\.\d{2})(\d+\.\d{2})\.?$/);
      if (negativePattern) {
        description = negativePattern[1].trim();
        amount = parseFloat(negativePattern[2]);
        matched = true;
        console.log(`[LocalOCR] Pattern NEG: "${description.substring(0, 30)}..." amt=${amount}`);
      }

      // Method 2: Positive amounts - find two consecutive decimal numbers at the end
      // Example: "N/C - ACRED A COMERCIOS FIRST DATA1220574.006087960.00"
      if (!matched) {
        const positivePattern = restOfLine.match(/^(.+?)(\d+\.\d{2})(\d+\.\d{2})\.?$/);
        if (positivePattern) {
          description = positivePattern[1].trim();
          amount = parseFloat(positivePattern[2]);
          matched = true;
          console.log(`[LocalOCR] Pattern POS: "${description.substring(0, 30)}..." amt=${amount}`);
        }
      }

      // Method 3: Handle case where balance might not have decimals
      // Example: "N/C - ACRED A COMERCIOS FIRST DATA1220574.006087960."
      if (!matched) {
        const noDecBalPattern = restOfLine.match(/^(.+?)(-?\d+\.\d{2})(\d+)\.?$/);
        if (noDecBalPattern) {
          description = noDecBalPattern[1].trim();
          amount = parseFloat(noDecBalPattern[2]);
          matched = true;
          console.log(`[LocalOCR] Pattern NODEC: "${description.substring(0, 30)}..." amt=${amount}`);
        }
      }

      // Method 4: Alternative - find the LAST occurrence of a negative sign followed by digits
      // This handles cases like: "N/D - DB TRF TERCEROS OB BH I 20321434003 FRANCISCO BAQUERIZA-25000.002440992.67"
      if (!matched) {
        // Find last negative sign that's followed by digits (this is the amount)
        const lastNegIdx = restOfLine.lastIndexOf('-');
        if (lastNegIdx > 10) { // Make sure there's enough for a description
          const afterNeg = restOfLine.substring(lastNegIdx);
          const amtMatch = afterNeg.match(/^(-\d+\.\d{2})(\d+\.?\d*)\.?$/);
          if (amtMatch) {
            description = restOfLine.substring(0, lastNegIdx).trim();
            amount = parseFloat(amtMatch[1]);
            matched = true;
            console.log(`[LocalOCR] Pattern LASTNEG: "${description.substring(0, 30)}..." amt=${amount}`);
          }
        }
      }

      // Method 5: For positive amounts with CUIT/numbers in description
      // Look for pattern where we have AMOUNT.DD followed by BALANCE.DD at the very end
      // Parse backwards from the end
      if (!matched) {
        // Remove trailing period if exists
        let cleanLine = restOfLine.replace(/\.$/, '');

        // Find balance (last number with 2 decimals)
        const balanceMatch = cleanLine.match(/(\d+\.\d{2})$/);
        if (balanceMatch) {
          const beforeBalance = cleanLine.substring(0, cleanLine.length - balanceMatch[1].length);

          // Find amount (number with 2 decimals before balance)
          const amountMatch = beforeBalance.match(/(-?\d+\.\d{2})$/);
          if (amountMatch) {
            description = beforeBalance.substring(0, beforeBalance.length - amountMatch[1].length).trim();
            amount = parseFloat(amountMatch[1]);
            if (description.length > 3) {
              matched = true;
              console.log(`[LocalOCR] Pattern BACKWARD: "${description.substring(0, 30)}..." amt=${amount}`);
            }
          }
        }
      }

      if (matched && description && description.length > 2) {
        // Extract CUIT info if available
        const cuitInfo = this.extractCuitInfo(description);

        transactions.push({
          fecha: this.parseDate(date),
          descripcion: description,
          monto: amount,
          saldo: null, // Leave balance empty as requested
          cuit: cuitInfo?.cuit || null,
          razonSocial: cuitInfo?.razonSocial || null,
          tipoMovimiento: amount < 0 ? 'debito' : 'credito'
        });

        console.log(`[LocalOCR] Hipotecario: ${date} | ${description.substring(0, 40)}... | ${amount}`);
      }
    }

    console.log(`[LocalOCR] Hipotecario: Found ${transactions.length} transactions`);
    return transactions;
  }

  /**
   * Extract transactions using Brubank patterns
   */
  extractBrubankTransactions(text) {
    const transactions = [];
    const patterns = this.bankPatterns.brubank.patterns;

    let match;
    while ((match = patterns.reverso.exec(text)) !== null) {
      const [, date, reference, description, amount] = match;

      transactions.push({
        fecha: this.parseDate(date),
        referencia: reference?.trim() || null,
        descripcion: `Reverso - ${description.trim()}`,
        dolares: 0,
        pesos: -Math.abs(this.parseAmount(amount))
      });
    }

    patterns.transaction.lastIndex = 0;

    while ((match = patterns.transaction.exec(text)) !== null) {
      const [fullMatch, date, reference, description, amount] = match;

      if (description.toLowerCase().includes('reverso')) {
        continue;
      }

      const parsedAmount = this.parseAmount(amount);

      transactions.push({
        fecha: this.parseDate(date),
        referencia: reference?.trim() || null,
        descripcion: description.trim(),
        dolares: 0,
        pesos: parsedAmount
      });
    }

    return transactions;
  }

  /**
   * Extract transactions using Santander patterns
   */
  extractSantanderTransactions(text) {
    const transactions = [];
    const lines = text.split('\n');

    console.log(`[LocalOCR] Santander: Processing ${lines.length} lines`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line || line.length < 10) continue;

      const dateMatch = line.match(/^(\d{2}\/\d{2}\/\d{2,4})/);
      if (!dateMatch) continue;

      const date = dateMatch[1];
      const restOfLine = line.substring(date.length).trim();

      if (restOfLine.toLowerCase().includes('fecha') ||
          restOfLine.toLowerCase().includes('período') ||
          restOfLine.toLowerCase().includes('desde') ||
          restOfLine.toLowerCase().includes('hasta')) {
        continue;
      }

      const amountPatterns = [
        /([-]?\$?\s*[\d.]+,\d{2})\s*$/,
        /([-]?\$?\s*[\d,]+\.\d{2})\s*$/,
        /([-]?\$?\s*[\d.]+)\s*$/
      ];

      let amount = null;
      let description = null;

      for (const pattern of amountPatterns) {
        const amountMatch = restOfLine.match(pattern);
        if (amountMatch) {
          amount = amountMatch[1];
          description = restOfLine.substring(0, restOfLine.length - amount.length).trim();
          break;
        }
      }

      if (amount && description && description.length > 2) {
        console.log(`[LocalOCR] Santander match: ${date} | ${description} | ${amount}`);

        transactions.push({
          fecha: this.parseDate(date),
          referencia: null,
          descripcion: description,
          dolares: 0,
          pesos: this.parseAmount(amount)
        });
      }
    }

    console.log(`[LocalOCR] Santander: Found ${transactions.length} transactions`);
    return transactions;
  }

  /**
   * Extract transactions from credit card statements
   */
  extractCreditCardTransactions(text) {
    const transactions = [];
    const lines = text.split('\n');

    console.log(`[LocalOCR] Credit Card: Processing ${lines.length} lines`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line || line.length < 10) continue;

      const dateMatch = line.match(/^(\d{1,2}\/\d{1,2})(?:\/\d{2,4})?\s+/);
      if (!dateMatch) continue;

      const date = dateMatch[1];
      const restOfLine = line.substring(dateMatch[0].length).trim();

      if (restOfLine.toLowerCase().includes('fecha') ||
          restOfLine.toLowerCase().includes('vencimiento') ||
          restOfLine.toLowerCase().includes('cierre')) {
        continue;
      }

      const amountPatterns = [
        /\$\s*([\d.]+,\d{2})\s*$/,
        /([\d.]+,\d{2})\s*$/,
        /\$\s*([\d,]+\.\d{2})\s*$/,
        /([\d,]+\.\d{2})\s*$/
      ];

      let amount = null;
      let description = null;

      for (const pattern of amountPatterns) {
        const amountMatch = restOfLine.match(pattern);
        if (amountMatch) {
          amount = amountMatch[1];
          description = restOfLine.substring(0, restOfLine.lastIndexOf(amount)).trim();
          break;
        }
      }

      if (amount && description && description.length > 2) {
        const currentDate = new Date();
        const [day, month] = date.split('/');
        let year = currentDate.getFullYear();

        if (parseInt(month) > currentDate.getMonth() + 1) {
          year--;
        }

        const fullDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

        console.log(`[LocalOCR] Credit Card match: ${fullDate} | ${description} | ${amount}`);

        transactions.push({
          fecha: fullDate,
          referencia: null,
          descripcion: description,
          dolares: 0,
          pesos: -Math.abs(this.parseAmount(amount))
        });
      }
    }

    console.log(`[LocalOCR] Credit Card: Found ${transactions.length} transactions`);
    return transactions;
  }

  /**
   * Extract transactions using generic patterns
   */
  extractGenericTransactions(text) {
    const transactions = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.length < 15) continue;

      const dateMatch = line.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
      if (!dateMatch) continue;

      const amountMatches = line.match(/([-]?\$?\s*[\d,]+\.\d{2})/g);
      if (!amountMatches || amountMatches.length === 0) continue;

      const date = dateMatch[1];
      const amount = amountMatches[amountMatches.length - 1];

      let description = line
        .replace(date, '')
        .replace(amount, '')
        .trim();

      if (description.length < 3) continue;

      transactions.push({
        fecha: this.parseDate(date),
        referencia: null,
        descripcion: description,
        dolares: 0,
        pesos: this.parseAmount(amount)
      });
    }

    return transactions;
  }

  /**
   * Extract statement date from text
   */
  extractStatementDate(text, bankType) {
    if (bankType === 'hipotecario') {
      const match = text.match(/Movimientos?\s+del\s+\d{2}\/\d{2}\/\d{4}\s+al\s+(\d{2}\/\d{2}\/\d{4})/i);
      if (match) {
        return this.parseDate(match[1]);
      }
    }

    const patterns = this.bankPatterns[bankType]?.patterns;
    if (!patterns || !patterns.statementDate) return null;

    const match = text.match(patterns.statementDate);
    if (match && match[1]) {
      return this.parseDate(match[1]);
    }

    return null;
  }

  /**
   * Main extraction method
   */
  async extractTransactions(textContent, fileName) {
    try {
      console.log('[LocalOCR] Starting local extraction...');

      const bankType = this.detectBank(textContent);
      console.log(`[LocalOCR] Detected bank: ${bankType}`);

      let movimientos = [];

      switch (bankType) {
        case 'hipotecario':
          movimientos = this.extractHipotecarioTransactions(textContent);
          break;
        case 'credit_card':
          movimientos = this.extractCreditCardTransactions(textContent);
          break;
        case 'brubank':
          movimientos = this.extractBrubankTransactions(textContent);
          break;
        case 'santander':
          movimientos = this.extractSantanderTransactions(textContent);
          break;
        default:
          movimientos = this.extractGenericTransactions(textContent);
      }

      console.log(`[LocalOCR] Extracted ${movimientos.length} transactions`);

      const statementDate = this.extractStatementDate(textContent, bankType);

      // Transform to internal format
      const transactions = movimientos.map(mov => {
        // Handle Hipotecario format which has monto instead of pesos
        const amount = mov.monto !== undefined ? mov.monto : (mov.pesos !== 0 ? mov.pesos : mov.dolares);

        return {
          transaction_date: mov.fecha,
          description: mov.descripcion || 'Unknown',
          merchant: this.extractMerchant(mov.descripcion),
          amount: amount,
          transaction_type: amount < 0 ? 'debit' : 'credit',
          reference_number: mov.referencia,
          balance: mov.saldo || null,
          cuit: mov.cuit || null,
          razon_social: mov.razonSocial || null,
          raw_data: mov,
          confidence_score: 85.0 // Higher confidence for bank-specific extraction
        };
      });

      return {
        transactions,
        bankName: this.bankPatterns[bankType]?.name || 'Unknown',
        statementDate: statementDate,
        confidenceScore: transactions.length > 0 ? 85.0 : 50.0,
        totalTransactions: transactions.length
      };
    } catch (error) {
      console.error('[LocalOCR] Extraction error:', error);
      throw new Error(`Local OCR error: ${error.message}`);
    }
  }

  /**
   * Check if local OCR is available
   */
  isAvailable() {
    return true;
  }
}

module.exports = new LocalOcrService();
