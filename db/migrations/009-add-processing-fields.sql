-- Add processing fields to files table for async processing
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS processing_metadata JSONB DEFAULT '{}'::jsonb;

-- Update existing files to have default processing_status if null
UPDATE files
SET processing_status = 'completed'
WHERE processing_status IS NULL;

-- Create index for quick status lookups
CREATE INDEX IF NOT EXISTS idx_files_processing_status
  ON files(processing_status)
  WHERE processing_status IN ('processing', 'pending');

COMMENT ON COLUMN files.processing_error IS 'Error message if processing failed';
COMMENT ON COLUMN files.processing_metadata IS 'Processing statistics: totalTransactions, transactionsInserted, duplicatesSkipped, confidenceScore, processingMethod, processedAt';
