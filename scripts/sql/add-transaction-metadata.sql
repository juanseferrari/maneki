-- ============================================
-- Add Transaction Metadata Columns
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add cuit column to transactions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'cuit'
  ) THEN
    ALTER TABLE transactions ADD COLUMN cuit VARCHAR(15);
    COMMENT ON COLUMN transactions.cuit IS 'CUIT (tax ID) extracted from transaction description, format: XX-XXXXXXXX-X';
  END IF;
END $$;

-- 2. Add razon_social column to transactions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'razon_social'
  ) THEN
    ALTER TABLE transactions ADD COLUMN razon_social VARCHAR(255);
    COMMENT ON COLUMN transactions.razon_social IS 'Company/person name extracted from transaction description';
  END IF;
END $$;

-- 3. Add document_type column to files table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'files' AND column_name = 'document_type'
  ) THEN
    ALTER TABLE files ADD COLUMN document_type VARCHAR(50);
    COMMENT ON COLUMN files.document_type IS 'Type of document: vep, bank_statement, credit_card_statement, invoice, receipt, etc.';
  END IF;
END $$;

-- 4. Add document_type_confidence column to files table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'files' AND column_name = 'document_type_confidence'
  ) THEN
    ALTER TABLE files ADD COLUMN document_type_confidence DECIMAL(5,2);
    COMMENT ON COLUMN files.document_type_confidence IS 'Confidence score for document type detection (0-100)';
  END IF;
END $$;

-- 5. Add bank_name column to transactions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'bank_name'
  ) THEN
    ALTER TABLE transactions ADD COLUMN bank_name VARCHAR(100);
    COMMENT ON COLUMN transactions.bank_name IS 'Name of the bank/institution from which this transaction was imported';
  END IF;
END $$;

-- 6. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_cuit ON transactions(cuit);
CREATE INDEX IF NOT EXISTS idx_transactions_razon_social ON transactions(razon_social);
CREATE INDEX IF NOT EXISTS idx_transactions_bank_name ON transactions(bank_name);
CREATE INDEX IF NOT EXISTS idx_files_document_type ON files(document_type);

-- ============================================
-- Verification Queries (run these to check)
-- ============================================

-- Check transactions table has new columns
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'transactions' AND column_name IN ('cuit', 'razon_social');

-- Check files table has new columns
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'files' AND column_name IN ('document_type', 'document_type_confidence');
