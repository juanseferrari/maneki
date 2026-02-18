-- Migration: Change transaction_date from DATE to TIMESTAMPTZ
-- Purpose: Store transaction time for better sorting and accuracy
-- Date: 2026-02-17
--
-- IMPORTANT: This migration is backwards compatible
-- Existing DATE values will be preserved and converted to TIMESTAMPTZ (midnight UTC)
-- New transactions will store full timestamp when available

-- Step 1: Add new column with timestamp
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS transaction_datetime TIMESTAMPTZ;

-- Step 2: Migrate existing data from transaction_date to transaction_datetime
-- Convert DATE to TIMESTAMPTZ (will be midnight UTC for existing records)
UPDATE transactions
SET transaction_datetime = transaction_date::TIMESTAMPTZ
WHERE transaction_datetime IS NULL;

-- Step 3: Make the new column NOT NULL now that it's populated
ALTER TABLE transactions
  ALTER COLUMN transaction_datetime SET NOT NULL;

-- Step 4: Drop the old date column (after confirming migration worked)
-- We'll keep transaction_date for now as a fallback, and drop it in a future migration
-- ALTER TABLE transactions DROP COLUMN transaction_date;

-- Step 5: Create index on new timestamp column
CREATE INDEX IF NOT EXISTS idx_transactions_datetime
  ON transactions(transaction_datetime DESC);

-- Step 6: Drop old date index if exists (we'll keep both for now during transition)
-- DROP INDEX IF EXISTS idx_transactions_date;

-- Comments
COMMENT ON COLUMN transactions.transaction_datetime IS 'Transaction date and time (TIMESTAMPTZ). Replaces transaction_date for better precision.';
COMMENT ON COLUMN transactions.transaction_date IS 'DEPRECATED: Use transaction_datetime instead. Kept for backwards compatibility.';

-- Create a view for backwards compatibility if needed
CREATE OR REPLACE VIEW transactions_with_date AS
SELECT
  *,
  transaction_datetime::DATE as date_only
FROM transactions;

COMMENT ON VIEW transactions_with_date IS 'Backwards compatibility view - provides date_only field extracted from transaction_datetime';
