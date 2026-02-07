const parserService = require('./parser.service');
const extractorService = require('./extractor.service');
const supabaseService = require('./supabase.service');
const vepProcessorService = require('./vep-processor.service');
const documentClassifier = require('./document-classifier.service');
const claudeService = require('./claude.service');
const claudeUsageTrackingService = require('./claude-usage-tracking.service');

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

      // Step 1.5: Detect document type using classifier
      console.log('[Processor] Step 1.5: Detecting document type...');
      const classification = documentClassifier.getFullClassification(textContent);
      console.log(`[Processor] Document classified as: ${classification.documentType.name} (confidence: ${classification.documentType.confidence}%)`);
      console.log(`[Processor] Bank detected: ${classification.bank.name}`);

      // Save document type to file metadata
      await supabaseService.updateFileProcessing(fileId, {
        document_type: classification.documentType.type,
        document_type_confidence: classification.documentType.confidence
      });

      // Route VEP documents to VEP processor
      if (classification.documentType.type === 'vep') {
        console.log('[Processor] Document detected as VEP - routing to VEP processor');
        return await vepProcessorService.processVepFile(fileMetadata, fileBuffer);
      }

      console.log(`[Processor] Document type: ${classification.documentType.fullName} - continuing with transaction extraction`);

      // Step 2: Get structured data (for CSV/XLSX)
      console.log('[Processor] Step 2: Extracting structured data...');
      const structuredData = await parserService.getStructuredData(
        fileBuffer,
        fileMetadata.mime_type,
        fileMetadata.original_name
      );

      // Step 3: Extract transactions using template matching
      console.log('[Processor] Step 3: Extracting transactions...');
      const extractionResult = await extractorService.extractTransactions(
        textContent,
        structuredData,
        fileMetadata.original_name
      );

      console.log(`[Processor] Extracted ${extractionResult.totalTransactions} transactions`);
      console.log(`[Processor] Template confidence score: ${extractionResult.confidenceScore}%`);

      // Step 3.5: DECISION TREE - Should we use Claude API?
      let finalResult = extractionResult;
      let processingMethod = 'template';
      let needsPreview = false;

      if (extractionResult.confidenceScore < 60) {
        console.log(`[Processor] ⚠️  Low confidence (${extractionResult.confidenceScore}%), checking Claude quota...`);

        // Check user's Claude API quota
        const quota = await claudeUsageTrackingService.checkQuota(fileMetadata.user_id);
        console.log(`[Processor] Claude quota status: ${quota.used}/${quota.limit} used, ${quota.remaining} remaining`);

        if (quota.available && claudeService.isClaudeAvailable()) {
          try {
            console.log('[Processor] ✅ Quota available - using Claude API for enhanced extraction...');

            // Call Claude for enhanced extraction
            const claudeResult = await claudeService.extractTransactionsEnhanced(
              textContent,
              fileMetadata.original_name,
              fileMetadata.user_id
            );

            // Increment usage counter atomically
            const usageResult = await claudeUsageTrackingService.incrementUsage(fileMetadata.user_id);
            console.log(`[Processor] Claude usage incremented: ${usageResult.usage_count}/${usageResult.monthly_limit}`);

            // Use Claude results
            finalResult = claudeResult;
            processingMethod = 'claude';
            needsPreview = true; // Always review AI results

            console.log(`[Processor] ✅ Claude extraction successful!`);
            console.log(`[Processor] - Confidence: ${claudeResult.confidenceScore}%`);
            console.log(`[Processor] - Transactions: ${claudeResult.totalTransactions}`);
            console.log(`[Processor] - Has metadata: ${!!claudeResult.documentMetadata}`);

          } catch (error) {
            console.error('[Processor] ❌ Claude extraction failed:', error.message);
            console.log('[Processor] Falling back to template results...');
            processingMethod = 'hybrid'; // Template fallback after Claude failure
            needsPreview = true; // Low confidence still needs review
          }
        } else {
          if (!quota.available) {
            console.log(`[Processor] ⛔ Quota exceeded (${quota.used}/${quota.limit}), using templates only`);
          } else {
            console.log(`[Processor] ⚠️  Claude API not configured, using templates only`);
          }
          needsPreview = true; // Low confidence needs review
        }
      } else {
        console.log(`[Processor] ✅ High confidence (${extractionResult.confidenceScore}%), using template results`);
      }

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
      // Use bank name from extraction result, or fall back to classifier detection
      const bankName = finalResult.bankName || (finalResult.documentMetadata && finalResult.documentMetadata.banco) || classification.bank.name;
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

      return {
        success: true,
        fileId,
        totalTransactions: finalResult.totalTransactions,
        transactionsInserted: saveResult.inserted.length,
        duplicatesSkipped: saveResult.duplicatesSkipped,
        confidenceScore: finalResult.confidenceScore,
        bankName: bankName,
        processingMethod: processingMethod,
        needsPreview: needsPreview
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
