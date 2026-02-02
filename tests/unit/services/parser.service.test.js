const ParserService = require('../../../services/parser.service');
const pdf = require('pdf-parse');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');

// Mock the external libraries
jest.mock('pdf-parse');
jest.mock('csv-parse/sync');
jest.mock('xlsx');

describe('ParserService', () => {
  let parserService;

  beforeEach(() => {
    parserService = new ParserService();
    jest.clearAllMocks();
  });

  describe('parseFile', () => {
    it('should route to PDF parser for PDF mime type', async () => {
      const mockPdfParse = jest.fn().mockResolvedValue({
        text: 'PDF content'
      });
      pdf.mockImplementation(mockPdfParse);

      const buffer = Buffer.from('fake pdf content');
      const result = await parserService.parseFile(buffer, 'application/pdf', 'test.pdf');

      expect(result).toBe('PDF content');
      expect(mockPdfParse).toHaveBeenCalledWith(buffer);
    });

    it('should route to CSV parser for CSV mime type', async () => {
      const mockParse = jest.fn().mockReturnValue([
        ['Header1', 'Header2'],
        ['Value1', 'Value2']
      ]);
      parse.mockImplementation(mockParse);

      const buffer = Buffer.from('Header1,Header2\nValue1,Value2');
      const result = await parserService.parseFile(buffer, 'text/csv', 'test.csv');

      expect(result).toContain('Header1');
      expect(result).toContain('Value1');
    });

    it('should route to CSV parser for .csv file extension', async () => {
      const mockParse = jest.fn().mockReturnValue([
        ['Header1', 'Header2'],
        ['Value1', 'Value2']
      ]);
      parse.mockImplementation(mockParse);

      const buffer = Buffer.from('Header1,Header2\nValue1,Value2');
      const result = await parserService.parseFile(buffer, 'text/plain', 'data.csv');

      expect(mockParse).toHaveBeenCalled();
    });

    it('should route to XLSX parser for Excel mime types', async () => {
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: {
          Sheet1: {
            A1: { v: 'Header1' },
            B1: { v: 'Header2' },
            A2: { v: 'Value1' },
            B2: { v: 'Value2' }
          }
        }
      };

      XLSX.read.mockReturnValue(mockWorkbook);
      XLSX.utils.sheet_to_csv.mockReturnValue('Header1,Header2\nValue1,Value2');

      const buffer = Buffer.from('fake excel content');
      const result = await parserService.parseFile(
        buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'test.xlsx'
      );

      expect(XLSX.read).toHaveBeenCalledWith(buffer, { type: 'buffer' });
      expect(result).toContain('Sheet1');
    });

    it('should throw error for unsupported file types', async () => {
      const buffer = Buffer.from('test');

      await expect(
        parserService.parseFile(buffer, 'application/zip', 'test.zip')
      ).rejects.toThrow('Unsupported file type: application/zip');
    });

    it('should handle parsing errors gracefully', async () => {
      pdf.mockImplementation(() => {
        throw new Error('PDF is corrupted');
      });

      const buffer = Buffer.from('corrupted pdf');

      await expect(
        parserService.parseFile(buffer, 'application/pdf', 'test.pdf')
      ).rejects.toThrow('Failed to parse file: PDF is corrupted');
    });
  });

  describe('parsePDF', () => {
    it('should extract text from PDF buffer', async () => {
      const mockText = 'This is extracted PDF text';
      pdf.mockResolvedValue({
        text: mockText,
        numpages: 1,
        info: {}
      });

      const buffer = Buffer.from('fake pdf');
      const result = await parserService.parsePDF(buffer);

      expect(result).toBe(mockText);
      expect(pdf).toHaveBeenCalledWith(buffer);
    });

    it('should handle PDF parsing errors', async () => {
      pdf.mockRejectedValue(new Error('Invalid PDF structure'));

      const buffer = Buffer.from('invalid pdf');

      await expect(parserService.parsePDF(buffer)).rejects.toThrow('PDF parsing failed: Invalid PDF structure');
    });
  });

  describe('parseCSV', () => {
    it('should parse CSV with comma delimiter', async () => {
      const csvContent = 'Name,Age,City\nJohn,30,NYC\nJane,25,LA';
      const mockParsedData = [
        ['Name', 'Age', 'City'],
        ['John', '30', 'NYC'],
        ['Jane', '25', 'LA']
      ];

      parse.mockReturnValue(mockParsedData);

      const buffer = Buffer.from(csvContent);
      const result = await parserService.parseCSV(buffer);

      expect(parse).toHaveBeenCalledWith(
        csvContent,
        expect.objectContaining({
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
          delimiter: ','
        })
      );
      expect(result).toContain('Name');
      expect(result).toContain('John');
    });

    it('should detect and use semicolon delimiter', async () => {
      const csvContent = 'Name;Age;City\nJohn;30;NYC';
      const mockParsedData = [
        ['Name', 'Age', 'City'],
        ['John', '30', 'NYC']
      ];

      parse.mockReturnValue(mockParsedData);

      const buffer = Buffer.from(csvContent);
      await parserService.parseCSV(buffer);

      expect(parse).toHaveBeenCalledWith(
        csvContent,
        expect.objectContaining({
          delimiter: ';'
        })
      );
    });

    it('should detect and use tab delimiter', async () => {
      const csvContent = 'Name\tAge\tCity\nJohn\t30\tNYC';
      const mockParsedData = [
        ['Name', 'Age', 'City'],
        ['John', '30', 'NYC']
      ];

      parse.mockReturnValue(mockParsedData);

      const buffer = Buffer.from(csvContent);
      await parserService.parseCSV(buffer);

      expect(parse).toHaveBeenCalledWith(
        csvContent,
        expect.objectContaining({
          delimiter: '\t'
        })
      );
    });
  });

  describe('parseXLSX', () => {
    it('should parse Excel file and extract text from all sheets', async () => {
      const mockWorkbook = {
        SheetNames: ['Sheet1', 'Sheet2'],
        Sheets: {
          Sheet1: {},
          Sheet2: {}
        }
      };

      XLSX.read.mockReturnValue(mockWorkbook);
      XLSX.utils.sheet_to_csv.mockReturnValueOnce('Data from Sheet1')
        .mockReturnValueOnce('Data from Sheet2');

      const buffer = Buffer.from('fake excel');
      const result = await parserService.parseXLSX(buffer);

      expect(XLSX.read).toHaveBeenCalledWith(buffer, { type: 'buffer' });
      expect(XLSX.utils.sheet_to_csv).toHaveBeenCalledTimes(2);
      expect(result).toContain('Sheet1');
      expect(result).toContain('Sheet2');
      expect(result).toContain('Data from Sheet1');
      expect(result).toContain('Data from Sheet2');
    });

    it('should handle empty Excel files', async () => {
      const mockWorkbook = {
        SheetNames: [],
        Sheets: {}
      };

      XLSX.read.mockReturnValue(mockWorkbook);

      const buffer = Buffer.from('empty excel');
      const result = await parserService.parseXLSX(buffer);

      expect(result).toBe('');
    });

    it('should handle Excel parsing errors', async () => {
      XLSX.read.mockImplementation(() => {
        throw new Error('Invalid Excel format');
      });

      const buffer = Buffer.from('invalid excel');

      await expect(parserService.parseXLSX(buffer)).rejects.toThrow('XLSX parsing failed: Invalid Excel format');
    });
  });
});
