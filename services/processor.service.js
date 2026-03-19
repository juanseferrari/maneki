const parserService = require('./parser.service');
const supabaseService = require('./supabase.service');
const vepProcessorService = require('./vep-processor.service');
const claudeService = require('./claude.service');
const claudeUsageTrackingService = require('./claude-usage-tracking.service');
const responseFormatterService = require('./response-formatter.service');

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

      // Check if this is a scanned PDF (empty or very short text)
      const isScannedPDF = fileMetadata.mime_type === 'application/pdf' && textContent.trim().length < 100;
      if (isScannedPDF) {
        console.log('[Processor] ⚠️  Detected scanned PDF with minimal text - will use Claude Vision API');
      }

      // Step 2: Get structured data (for CSV/XLSX)
      console.log('[Processor] Step 2: Extracting structured data...');
      const structuredData = await parserService.getStructuredData(
        fileBuffer,
        fileMetadata.mime_type,
        fileMetadata.original_name
      );

      // Step 3: ALWAYS use Claude for extraction and document type detection
      console.log('[Processor] Step 3: Using Claude for document analysis and extraction...');

      // Check user's Claude API quota
      const quota = await claudeUsageTrackingService.checkQuota(fileMetadata.user_id);
      console.log(`[Processor] Claude quota status: ${quota.used}/${quota.limit} used, ${quota.remaining} remaining`);

      if (!quota.available || !claudeService.isClaudeAvailable()) {
        throw new Error('Claude API quota exceeded or unavailable. Please try again later.');
      }

      // Prepare content for Claude
      let contentForClaude = textContent;

      console.log('[Processor] === PREPARING CONTENT FOR CLAUDE ===');
      console.log(`[Processor] File: ${fileMetadata.original_name}`);
      console.log(`[Processor] Text content length: ${textContent.length} chars`);
      console.log(`[Processor] Structured data rows: ${structuredData ? structuredData.length : 0}`);
      console.log(`[Processor] Text content preview (first 500 chars):`);
      console.log(textContent.substring(0, 500));
      console.log('[Processor] === END PREPARATION ===');

      // If we have structured data (CSV/XLSX) and little/no text, convert to readable format
      if (structuredData && structuredData.length > 0 && textContent.trim().length < 100) {
        console.log('[Processor] Converting structured data to readable format for Claude...');

        const headers = Object.keys(structuredData[0]);
        const headerRow = headers.join(' | ');
        const separator = headers.map(() => '---').join(' | ');
        const dataRows = structuredData.slice(0, 200).map(row => {
          return headers.map(h => row[h] || '').join(' | ');
        }).join('\n');

        contentForClaude = `STRUCTURED DATA (${structuredData.length} rows):\n\n${headerRow}\n${separator}\n${dataRows}`;

        if (structuredData.length > 200) {
          contentForClaude += `\n\n... (${structuredData.length - 200} more rows not shown)`;
        }

        console.log(`[Processor] Prepared ${structuredData.length} rows for Claude analysis`);
      }

      // Call Claude for extraction AND document type detection
      const claudeResult = await claudeService.extractTransactionsEnhanced(
        contentForClaude,
        fileMetadata.original_name,
        fileMetadata.user_id,
        isScannedPDF ? fileBuffer : null
      );

      // Increment usage counter
      const usageResult = await claudeUsageTrackingService.incrementUsage(fileMetadata.user_id);
      console.log(`[Processor] Claude usage incremented: ${usageResult.usage_count}/${usageResult.monthly_limit}`);

      console.log(`[Processor] ✅ Claude extraction successful!`);
      console.log(`[Processor] - Document Type: ${claudeResult.documentType}`);
      console.log(`[Processor] - Confidence: ${claudeResult.confidenceScore}%`);
      console.log(`[Processor] - Transactions: ${claudeResult.totalTransactions}`);

      // Save document type detected by Claude
      await supabaseService.updateFileProcessing(fileId, {
        document_type: claudeResult.documentType,
        document_type_confidence: claudeResult.confidenceScore
      });

      // Handle VEP documents
      if (claudeResult.documentType === 'vep') {
        console.log('[Processor] Document is a VEP - using VEP processor for storage');
        return await vepProcessorService.processVepFile(fileMetadata, fileBuffer, claudeResult.vepData);
      }

      // For non-VEP documents, continue with normal transaction processing
      const finalResult = claudeResult;
      const processingMethod = 'claude';
      const needsPreview = true; // Always review Claude results

      // Mark transactions for review if needed
      if (needsPreview) {
        console.log('[Processor] 📝 Marking transactions for user review...');
        finalResult.transactions.forEach(tx => {
          tx.needs_review = true;
          tx.processed_by_claude = (processingMethod === 'claude');
        });
      }

      console.log(`[Processor] Final extraction: ${finalResult.totalTransactions} transactions (method: ${processingMethod})`);

      // Step 4: Save transactions to database
      console.log('[Processor] Step 4: Saving transactions to database...');
      // Use bank name from Claude's extraction result
      const bankName = finalResult.bankName || (finalResult.documentMetadata && finalResult.documentMetadata.banco) || 'Unknown';
      const saveResult = await supabaseService.saveTransactions(
        fileId,
        finalResult.transactions,
        fileMetadata.user_id, // Pass user_id from file metadata
        bankName // Pass bank name to save with each transaction
      );

      // Log duplicate statistics
      if (saveResult.duplicatesSkipped > 0) {
        console.log(`[Processor] Duplicates detected: ${saveResult.duplicatesSkipped} transactions were skipped`);
        console.log(`[Processor] Inserted: ${saveResult.inserted.length} new transactions`);
      }

      // Step 4.5: Save installments if present
      if (finalResult.transactions.some(tx => tx.installment_data)) {
        console.log('[Processor] Step 4.5: Saving installment data...');
        try {
          // Filter transactions that have installment data and were inserted
          const transactionsWithInstallments = finalResult.transactions
            .filter(tx => tx.installment_data && saveResult.inserted.some(ins => ins.description === tx.description));

          if (transactionsWithInstallments.length > 0) {
            await supabaseService.saveInstallments(transactionsWithInstallments, fileMetadata.user_id);
            console.log(`[Processor] ✅ Saved ${transactionsWithInstallments.length} installment records`);
          }
        } catch (error) {
          console.error('[Processor] ⚠️  Failed to save installments (non-critical):', error.message);
        }
      }

      // Step 5: Update file metadata with processing method and document metadata
      console.log('[Processor] Step 5: Updating file metadata...');
      const fileUpdate = {
        processing_status: 'completed',
        confidence_score: finalResult.confidenceScore,
        bank_name: bankName,
        statement_date: finalResult.statementDate,
        processing_completed_at: new Date().toISOString(),
        processing_method: processingMethod
      };

      // Add document metadata if available (from Claude)
      if (finalResult.documentMetadata) {
        fileUpdate.metadata = finalResult.documentMetadata;
        console.log('[Processor] 📄 Saving document metadata:', JSON.stringify(finalResult.documentMetadata));
      }

      await supabaseService.updateFileProcessing(fileId, fileUpdate);

      // Log duplicate statistics for visibility
      console.log(`[Processor] Final statistics:`, {
        total_extracted: finalResult.totalTransactions,
        transactions_inserted: saveResult.inserted.length,
        duplicates_skipped: saveResult.duplicatesSkipped,
        processing_method: processingMethod,
        needs_preview: needsPreview
      });

      console.log(`[Processor] ✅ Successfully processed file: ${fileMetadata.original_name}`);

      // Get updated file metadata from database for formatting
      const { data: updatedFileMetadata } = await supabaseService.supabase
        .from('files')
        .select('*')
        .eq('id', fileId)
        .single();

      // Format response using ResponseFormatterService
      const formattedResponse = responseFormatterService.formatResponse(
        updatedFileMetadata || fileMetadata,
        {
          ...finalResult,
          duplicatesSkipped: saveResult.duplicatesSkipped
        },
        processingMethod
      );

      console.log(`[Processor] 📋 Generated standardized JSON response`);

      // Return both old format (for backward compatibility) and new formatted response
      return {
        // Old format (backward compatibility)
        success: true,
        fileId,
        totalTransactions: finalResult.totalTransactions,
        transactionsInserted: saveResult.inserted.length,
        duplicatesSkipped: saveResult.duplicatesSkipped,
        confidenceScore: finalResult.confidenceScore,
        bankName: bankName,
        processingMethod: processingMethod,
        needsPreview: needsPreview,
        // New standardized format
        formatted: formattedResponse
      };
    } catch (error) {
      console.error('[Processor] Processing failed:', error);

      // Update file status to failed
      await supabaseService.updateFileStatus(fileId, 'failed', error.message);

      // Format error response
      const errorResponse = responseFormatterService.formatError(fileMetadata, error);

      return {
        // Old format (backward compatibility)
        success: false,
        fileId,
        error: error.message,
        // New standardized format
        formatted: errorResponse
      };
    }
  }
}

module.exports = new ProcessorService();
