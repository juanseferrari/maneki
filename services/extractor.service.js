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

      return {
        transaction_date: date,
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
      // Handle YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString;
      }

      // Handle DD/MM/YYYY format
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
        const [day, month, year] = dateString.split('/');
        return `${year}-${month}-${day}`;
      }

      // Try to parse as Date object
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }

      return null;
    } catch (error) {
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
