const pdf = require('pdf-parse');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');

class ParserService {
  /**
   * Parse a file based on its MIME type
   * @param {Buffer} fileBuffer - The file buffer
   * @param {string} mimeType - The MIME type of the file
   * @param {string} fileName - The original file name
   * @returns {Promise<string>} Extracted text content
   */
  async parseFile(fileBuffer, mimeType, fileName) {
    try {
      if (mimeType === 'application/pdf') {
        return await this.parsePDF(fileBuffer);
      } else if (mimeType === 'text/csv' || fileName.endsWith('.csv')) {
        return await this.parseCSV(fileBuffer);
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        fileName.endsWith('.xlsx') ||
        fileName.endsWith('.xls')
      ) {
        return await this.parseXLSX(fileBuffer);
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }
    } catch (error) {
      console.error('Parse error:', error);
      throw new Error(`Failed to parse file: ${error.message}`);
    }
  }

  /**
   * Parse PDF file
   * @param {Buffer} fileBuffer
   * @returns {Promise<string>}
   */
  async parsePDF(fileBuffer) {
    try {
      console.log('[Parser] Extracting text from PDF...');
      const data = await pdf(fileBuffer);

      console.log(`[Parser] PDF parsed successfully, extracted ${data.text.length} characters`);
      console.log('[Parser] First 500 characters:', data.text.substring(0, 500));

      return data.text;
    } catch (error) {
      console.error('[Parser] PDF parsing error:', error);
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse CSV file
   * @param {Buffer} fileBuffer
   * @returns {Promise<string>}
   */
  async parseCSV(fileBuffer) {
    try {
      const csvText = fileBuffer.toString('utf-8');
      const records = parse(csvText, {
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
      });

      // Convert to a readable text format
      return records.map(row => row.join(' | ')).join('\n');
    } catch (error) {
      throw new Error(`CSV parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse XLSX/XLS file
   * @param {Buffer} fileBuffer
   * @returns {Promise<string>}
   */
  async parseXLSX(fileBuffer) {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

      // Get the first sheet
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Convert to CSV format first
      const csv = XLSX.utils.sheet_to_csv(worksheet);

      // Convert to readable text format
      const rows = csv.split('\n').filter(row => row.trim() !== '');
      return rows.join('\n');
    } catch (error) {
      throw new Error(`XLSX parsing failed: ${error.message}`);
    }
  }

  /**
   * Get structured data from parsed content (CSV/XLSX only)
   * This returns an array of objects for easier processing
   * @param {Buffer} fileBuffer
   * @param {string} mimeType
   * @param {string} fileName
   * @returns {Promise<Array<Object>>}
   */
  async getStructuredData(fileBuffer, mimeType, fileName) {
    try {
      if (mimeType === 'text/csv' || fileName.endsWith('.csv')) {
        const csvText = fileBuffer.toString('utf-8');
        const records = parse(csvText, {
          columns: true, // Use first row as headers
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true
        });
        return records;
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        fileName.endsWith('.xlsx') ||
        fileName.endsWith('.xls')
      ) {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to JSON with first row as headers
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        return jsonData;
      }

      return null; // For PDFs, we'll rely on text extraction
    } catch (error) {
      console.error('Structured data extraction error:', error);
      return null;
    }
  }
}

module.exports = new ParserService();
