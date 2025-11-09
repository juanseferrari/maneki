/**
 * Local OCR Service
 * Uses pattern matching and rule-based extraction to parse bank statements
 * No external API calls - completely local processing
 */
class LocalOcrService {
  constructor() {
    this.bankPatterns = {
      brubank: {
        name: 'Brubank',
        patterns: {
          // Match transactions like: "16/11/2024 12345 MERCHANT NAME -1,234.56"
          transaction: /(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(.+?)\s+([-]?\$?\s*[\d,]+\.?\d*)/g,
          // Alternative pattern for transactions with reverso
          reverso: /(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+Reverso\s*-?\s*(.+?)\s+([-]?\$?\s*[\d,]+\.?\d*)/gi,
          statementDate: /(?:Estado de Cuenta|Estado del)\s+(?:del?\s+)?(\d{2}\/\d{2}\/\d{4})/i,
          balance: /Saldo\s+(?:Final|Actual)?\s*:?\s*\$?\s*([\d,]+\.?\d*)/i
        }
      },
      santander: {
        name: 'Santander',
        patterns: {
          // Match transactions with date, description, and amount
          transaction: /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-]?\$?\s*[\d,]+\.?\d*)\s*$/gm,
          statementDate: /(?:Resumen|Estado)\s+(?:del?\s+)?(\d{2}\/\d{2}\/\d{4})/i,
          balance: /Saldo\s+(?:Final|Actual)?\s*:?\s*\$?\s*([\d,]+\.?\d*)/i
        }
      },
      generic: {
        name: 'Generic',
        patterns: {
          // Generic date pattern
          date: /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/g,
          // Generic amount pattern (with currency symbols)
          amount: /([-]?\$?\s*[\d,]+\.?\d{2})/g,
          // Common transaction keywords
          keywords: /(?:compra|pago|transferencia|débito|crédito|extracción|depósito)/gi
        }
      }
    };
  }

  /**
   * Detect which bank the statement is from
   * @param {string} text - Document text content
   * @returns {string} Bank identifier
   */
  detectBank(text) {
    const textLower = text.toLowerCase();

    if (textLower.includes('brubank') || textLower.includes('bru bank')) {
      return 'brubank';
    }

    if (textLower.includes('santander') || textLower.includes('banco santander')) {
      return 'santander';
    }

    // Add more bank detection patterns here
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
   * Parse amount from string
   * Handles both formats: 1,234.56 (US) and 1.234,56 (AR/EU)
   * @param {string} amountStr - Amount string
   * @returns {number} Parsed amount
   */
  parseAmount(amountStr) {
    if (!amountStr) return 0;

    // Remove currency symbols and spaces
    let cleaned = amountStr.replace(/[$\s]/g, '');

    // Detect format based on last separator
    // If last separator is comma, it's AR/EU format (1.234,56)
    // If last separator is dot, it's US format (1,234.56)
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    if (lastComma > lastDot) {
      // Argentine/European format: 1.234,56
      // Remove dots (thousands separator) and replace comma with dot
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 1,234.56
      // Remove commas (thousands separator)
      cleaned = cleaned.replace(/,/g, '');
    }

    // Parse as float
    const amount = parseFloat(cleaned);

    return isNaN(amount) ? 0 : amount;
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
      .replace(/^(compra|pago|transferencia|débito|crédito)\s+/gi, '')
      .replace(/cuota \d+ de \d+/gi, '')
      .replace(/reverso\s*-?\s*/gi, '')
      .trim();

    // Take first part before dash or hyphen
    const parts = merchant.split(/\s+-\s+/);
    merchant = parts[0] || merchant;

    // Limit length
    return merchant.substring(0, 100).trim();
  }

  /**
   * Extract transactions using Brubank patterns
   * @param {string} text - Document text
   * @returns {Array} Extracted transactions
   */
  extractBrubankTransactions(text) {
    const transactions = [];
    const patterns = this.bankPatterns.brubank.patterns;

    // First, try to extract reverso transactions
    let match;
    while ((match = patterns.reverso.exec(text)) !== null) {
      const [, date, reference, description, amount] = match;

      transactions.push({
        fecha: this.parseDate(date),
        referencia: reference?.trim() || null,
        descripcion: `Reverso - ${description.trim()}`,
        dolares: 0,
        pesos: -Math.abs(this.parseAmount(amount)) // Reverso is always negative
      });
    }

    // Reset regex
    patterns.transaction.lastIndex = 0;

    // Then extract regular transactions
    while ((match = patterns.transaction.exec(text)) !== null) {
      const [fullMatch, date, reference, description, amount] = match;

      // Skip if this looks like a reverso (already processed)
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
   * @param {string} text - Document text
   * @returns {Array} Extracted transactions
   */
  extractSantanderTransactions(text) {
    const transactions = [];
    const lines = text.split('\n');

    console.log(`[LocalOCR] Santander: Processing ${lines.length} lines`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and headers
      if (!line || line.length < 10) continue;

      // Look for date at the start - support both DD/MM/YYYY and DD/MM/YY
      const dateMatch = line.match(/^(\d{2}\/\d{2}\/\d{2,4})/);
      if (!dateMatch) continue;

      const date = dateMatch[1];
      const restOfLine = line.substring(date.length).trim();

      // Skip header lines
      if (restOfLine.toLowerCase().includes('fecha') ||
          restOfLine.toLowerCase().includes('período') ||
          restOfLine.toLowerCase().includes('desde') ||
          restOfLine.toLowerCase().includes('hasta')) {
        continue;
      }

      // Look for amounts with various formats:
      // - With decimals: 1.234,56 or 1,234.56
      // - With $ sign
      // - Negative with - sign
      const amountPatterns = [
        /([-]?\$?\s*[\d.]+,\d{2})\s*$/,  // Format: 1.234,56
        /([-]?\$?\s*[\d,]+\.\d{2})\s*$/,  // Format: 1,234.56
        /([-]?\$?\s*[\d.]+)\s*$/          // Format: 1234.56 or 1.234
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
   * Extract transactions using generic patterns
   * @param {string} text - Document text
   * @returns {Array} Extracted transactions
   */
  extractGenericTransactions(text) {
    const transactions = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip short lines
      if (line.length < 15) continue;

      // Look for lines with dates
      const dateMatch = line.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
      if (!dateMatch) continue;

      // Look for amounts in the line
      const amountMatches = line.match(/([-]?\$?\s*[\d,]+\.\d{2})/g);
      if (!amountMatches || amountMatches.length === 0) continue;

      const date = dateMatch[1];
      const amount = amountMatches[amountMatches.length - 1]; // Take last amount

      // Extract description (text between date and amount)
      let description = line
        .replace(date, '')
        .replace(amount, '')
        .trim();

      // Skip if description is too short
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
   * @param {string} text - Document text
   * @param {string} bankType - Bank identifier
   * @returns {string|null} Statement date
   */
  extractStatementDate(text, bankType) {
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
   * @param {string} textContent - Raw text from document
   * @param {string} fileName - Original file name
   * @returns {Object} Extraction result
   */
  async extractTransactions(textContent, fileName) {
    try {
      console.log('[LocalOCR] Starting local extraction...');

      // Detect bank
      const bankType = this.detectBank(textContent);
      console.log(`[LocalOCR] Detected bank: ${bankType}`);

      let movimientos = [];

      // Extract transactions based on bank type
      switch (bankType) {
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

      // Extract statement date
      const statementDate = this.extractStatementDate(textContent, bankType);

      // Transform to internal format
      const transactions = movimientos.map(mov => {
        const amount = mov.pesos !== 0 ? mov.pesos : mov.dolares;

        return {
          transaction_date: mov.fecha,
          description: mov.descripcion || 'Unknown',
          merchant: this.extractMerchant(mov.descripcion),
          amount: amount,
          transaction_type: amount < 0 ? 'debit' : 'credit',
          reference_number: mov.referencia,
          raw_data: mov,
          confidence_score: 75.0 // Local extraction confidence
        };
      });

      return {
        transactions,
        bankName: this.bankPatterns[bankType]?.name || 'Unknown',
        statementDate: statementDate,
        confidenceScore: 75.0,
        totalTransactions: transactions.length
      };
    } catch (error) {
      console.error('[LocalOCR] Extraction error:', error);
      throw new Error(`Local OCR error: ${error.message}`);
    }
  }

  /**
   * Check if local OCR is available
   * @returns {boolean}
   */
  isAvailable() {
    return true; // Always available since it's local
  }
}

module.exports = new LocalOcrService();
