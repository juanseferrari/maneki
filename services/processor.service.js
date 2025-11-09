const parserService = require('./parser.service');
const extractorService = require('./extractor.service');
const supabaseService = require('./supabase.service');
const vepProcessorService = require('./vep-processor.service');

/**
 * Processing Service
 * Orchestrates file parsing, transaction extraction, and database storage
 * Automatically detects document type (bank statement or VEP) and routes accordingly
 */
class ProcessorService {
  /**
   * Process an uploaded file
   * @param {Object} fileMetadata - File metadata from upload
   * @param {Buffer} fileBuffer - File content buffer
   * @returns {Promise<Object>} Processing result
   */
  async processFile(fileMetadata, fileBuffer) {
    const fileId = fileMetadata.id;

    try {
      // Update file status to processing
      await supabaseService.updateFileStatus(fileId, 'processing');

      console.log(`[Processor] Starting to process file: ${fileMetadata.original_name}`);

      // Step 1: Parse the file
      console.log('[Processor] Step 1: Parsing file...');
      const textContent = await parserService.parseFile(
        fileBuffer,
        fileMetadata.mime_type,
        fileMetadata.original_name
      );

      // Step 1.5: Detect document type - VEP or Bank Statement
      console.log('[Processor] Step 1.5: Detecting document type...');
      const isVep = vepProcessorService.isVepDocument(textContent);

      if (isVep) {
        console.log('[Processor] Document detected as VEP - routing to VEP processor');
        return await vepProcessorService.processVepFile(fileMetadata, fileBuffer);
      }

      console.log('[Processor] Document detected as bank statement - continuing with standard processing');

      // Step 2: Get structured data (for CSV/XLSX)
      console.log('[Processor] Step 2: Extracting structured data...');
      const structuredData = await parserService.getStructuredData(
        fileBuffer,
        fileMetadata.mime_type,
        fileMetadata.original_name
      );

      // Step 3: Extract transactions
      console.log('[Processor] Step 3: Extracting transactions...');
      const extractionResult = await extractorService.extractTransactions(
        textContent,
        structuredData,
        fileMetadata.original_name
      );

      console.log(`[Processor] Extracted ${extractionResult.totalTransactions} transactions`);
      console.log(`[Processor] Confidence score: ${extractionResult.confidenceScore}%`);

      // Step 4: Save transactions to database
      console.log('[Processor] Step 4: Saving transactions to database...');
      await supabaseService.saveTransactions(
        fileId,
        extractionResult.transactions,
        null // userId - will be null until auth is added
      );

      // Step 5: Update file metadata
      console.log('[Processor] Step 5: Updating file metadata...');
      await supabaseService.updateFileProcessing(fileId, {
        processing_status: 'completed',
        confidence_score: extractionResult.confidenceScore,
        bank_name: extractionResult.bankName,
        statement_date: extractionResult.statementDate,
        processing_completed_at: new Date().toISOString()
      });

      console.log(`[Processor] Successfully processed file: ${fileMetadata.original_name}`);

      return {
        success: true,
        fileId,
        totalTransactions: extractionResult.totalTransactions,
        confidenceScore: extractionResult.confidenceScore,
        bankName: extractionResult.bankName
      };
    } catch (error) {
      console.error('[Processor] Processing failed:', error);

      // Update file status to failed
      await supabaseService.updateFileStatus(fileId, 'failed', error.message);

      return {
        success: false,
        fileId,
        error: error.message
      };
    }
  }
}

module.exports = new ProcessorService();
