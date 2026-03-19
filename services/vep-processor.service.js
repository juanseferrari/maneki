const parserService = require('./parser.service');
const vepOcrService = require('./vep-ocr.service');
const supabaseService = require('./supabase.service');

/**
 * VEP Processing Service
 * Orchestrates VEP file parsing, data extraction, and database storage
 */
class VepProcessorService {
  /**
   * Process an uploaded VEP file
   * @param {Object} fileMetadata - File metadata from upload
   * @param {Buffer} fileBuffer - File content buffer
   * @param {Object} claudeVepData - Optional VEP data already extracted by Claude
   * @returns {Promise<Object>} Processing result
   */
  async processVepFile(fileMetadata, fileBuffer, claudeVepData = null) {
    const fileId = fileMetadata.id;

    try {
      // Update file status to processing
      await supabaseService.updateFileStatus(fileId, 'processing');

      console.log(`[VEP-Processor] Starting to process VEP file: ${fileMetadata.original_name}`);

      let extractionResult;

      // If Claude already extracted VEP data, use it
      if (claudeVepData) {
        console.log('[VEP-Processor] Using VEP data from Claude');
        extractionResult = {
          vepData: claudeVepData,
          confidenceScore: 95 // High confidence from Claude
        };
      } else {
        // Fallback to traditional VEP OCR extraction
        console.log('[VEP-Processor] Step 1: Parsing file...');
        const textContent = await parserService.parseFile(
          fileBuffer,
          fileMetadata.mime_type,
          fileMetadata.original_name
        );

        console.log('[VEP-Processor] Step 2: Extracting VEP data...');

        // Check if this is actually a VEP document
        if (!vepOcrService.isVepDocument(textContent)) {
          throw new Error('This document does not appear to be a VEP (Volante Electrónico de Pago)');
        }

        extractionResult = await vepOcrService.extractVepData(
          textContent,
          fileMetadata.original_name
        );
      }

      console.log(`[VEP-Processor] VEP extracted successfully: #${extractionResult.vepData.nro_vep}`);
      console.log(`[VEP-Processor] Confidence score: ${extractionResult.confidenceScore}%`);
      console.log(`[VEP-Processor] Total amount: $${extractionResult.vepData.importe_total_pagar}`);

      // Step 3: Save VEP to database
      console.log('[VEP-Processor] Step 3: Saving VEP to database...');
      await supabaseService.saveVep(
        fileId,
        extractionResult.vepData,
        null // userId - will be null until auth is added
      );

      // Step 4: Update file metadata
      console.log('[VEP-Processor] Step 4: Updating file metadata...');
      await supabaseService.updateFileProcessing(fileId, {
        processing_status: 'completed',
        confidence_score: extractionResult.confidenceScore,
        bank_name: extractionResult.vepData.organismo_recaudador,
        statement_date: extractionResult.vepData.fecha_generacion,
        processing_completed_at: new Date().toISOString()
      });

      // Update file document type
      await supabaseService.updateFileDocumentType(fileId, 'vep');

      console.log(`[VEP-Processor] Successfully processed VEP file: ${fileMetadata.original_name}`);

      return {
        success: true,
        fileId,
        vepNumber: extractionResult.vepData.nro_vep,
        totalAmount: extractionResult.vepData.importe_total_pagar,
        confidenceScore: extractionResult.confidenceScore,
        expirationDate: extractionResult.vepData.dia_expiracion
      };
    } catch (error) {
      console.error('[VEP-Processor] Processing failed:', error);

      // Update file status to failed
      await supabaseService.updateFileStatus(fileId, 'failed', error.message);

      return {
        success: false,
        fileId,
        error: error.message
      };
    }
  }

  /**
   * Check if a file should be processed as a VEP
   * This is called before processing to determine document type
   * @param {string} textContent - Extracted text content
   * @returns {boolean}
   */
  isVepDocument(textContent) {
    return vepOcrService.isVepDocument(textContent);
  }
}

module.exports = new VepProcessorService();
