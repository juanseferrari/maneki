const parserService = require('./parser.service');
const extractorService = require('./extractor.service');
const supabaseService = require('./supabase.service');
const vepProcessorService = require('./vep-processor.service');
const documentClassifier = require('./document-classifier.service');
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

      // Check if this is an unsupported bank (not Santander or Hipotecario)
      const supportedBanks = ['Banco Santander', 'Banco Hipotecario', 'santander', 'hipotecario'];
      const isUnsupportedBank = extractionResult.bankName &&
        !supportedBanks.some(bank => extractionResult.bankName.toLowerCase().includes(bank.toLowerCase()));

      if (isUnsupportedBank) {
        console.log(`[Processor] ⚠️  Unsupported bank detected: ${extractionResult.bankName} - will use Claude for better accuracy`);
      }

      // Use stricter threshold (75% instead of 60%) to catch more edge cases
      // Generic extractor often gives false confidence, better to use Claude
      // Also force Claude for unsupported banks
      if (extractionResult.confidenceScore < 75 || isUnsupportedBank) {
        const reason = isUnsupportedBank ? 'unsupported bank' : `confidence below threshold (${extractionResult.confidenceScore}% < 75%)`;
        console.log(`[Processor] ⚠️  ${reason}, checking Claude quota...`);

        // Check user's Claude API quota
        const quota = await claudeUsageTrackingService.checkQuota(fileMetadata.user_id);
        console.log(`[Processor] Claude quota status: ${quota.used}/${quota.limit} used, ${quota.remaining} remaining`);

        if (quota.available && claudeService.isClaudeAvailable()) {
          try {
            console.log('[Processor] ✅ Quota available - using Claude API for enhanced extraction...');

            // Prepare content for Claude
            let contentForClaude = textContent;

            console.log('[Processor] === PREPARING CONTENT FOR CLAUDE ===');
            console.log(`[Processor] File: ${fileMetadata.original_name}`);
            console.log(`[Processor] Text content length: ${textContent.length} chars`);
            console.log(`[Processor] Structured data rows: ${structuredData ? structuredData.length : 0}`);
            console.log(`[Processor] Text content preview (first 500 chars):`);
            console.log(textContent.substring(0, 500));
            console.log('[Processor] === END PREPARATION ===');

            // If we have structured data (CSV/XLSX) and little/no text, convert structured data to readable format
            if (structuredData && structuredData.length > 0 && textContent.trim().length < 100) {
              console.log('[Processor] Converting structured data to readable format for Claude...');

              // Convert array of objects to formatted text
              const headers = Object.keys(structuredData[0]);
              const headerRow = headers.join(' | ');
              const separator = headers.map(() => '---').join(' | ');
              const dataRows = structuredData.slice(0, 200).map(row => { // Limit to 200 rows to avoid token limits
                return headers.map(h => row[h] || '').join(' | ');
              }).join('\n');

              contentForClaude = `STRUCTURED DATA (${structuredData.length} rows):\n\n${headerRow}\n${separator}\n${dataRows}`;

              if (structuredData.length > 200) {
                contentForClaude += `\n\n... (${structuredData.length - 200} more rows not shown)`;
              }

              console.log(`[Processor] Prepared ${structuredData.length} rows for Claude analysis`);
            }

            // Call Claude for enhanced extraction
            // Pass fileBuffer if this is a scanned PDF
            const claudeResult = await claudeService.extractTransactionsEnhanced(
              contentForClaude,
              fileMetadata.original_name,
              fileMetadata.user_id,
              isScannedPDF ? fileBuffer : null
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

            // === NUEVO: Aprender template de Claude ===
            console.log('[Processor] 🧠 Intentando aprender template de resultado de Claude...');
            const templateLearning = require('./template-learning.service');

            // Solo aprender si confidence > 80% y hay structured data
            if (claudeResult.confidenceScore >= 80 && structuredData && structuredData.length > 0) {
              try {
                const learnedTemplate = await templateLearning.learnFromClaudeResult(
                  claudeResult,
                  structuredData,
                  classification.bank.id,
                  classification.bank.name,
                  fileId,
                  fileMetadata.user_id
                );

                if (learnedTemplate) {
                  console.log(`[Processor] ✅ Template aprendido exitosamente (ID: ${learnedTemplate.id})`);
                  console.log(`[Processor] Próximos archivos de ${classification.bank.name} usarán este template automáticamente`);
                } else {
                  console.log(`[Processor] ℹ️  No se pudo crear template (quizás ya existe o faltan datos)`);
                }
              } catch (error) {
                console.error('[Processor] ⚠️  Error al aprender template (no crítico):', error.message);
              }
            }
            // === FIN NUEVO ===

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
