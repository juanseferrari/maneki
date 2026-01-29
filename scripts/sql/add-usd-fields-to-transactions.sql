-- =====================================================
-- MIGRATION: Add USD conversion fields to transactions table
-- Purpose: Support multi-currency with USD normalization
-- =====================================================

-- Step 1: Add new columns for USD conversion
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS amount_usd DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10, 6),
ADD COLUMN IF NOT EXISTS exchange_rate_date DATE;

-- Step 2: Add comments for documentation
COMMENT ON COLUMN transactions.amount_usd IS 'Transaction amount converted to USD';
COMMENT ON COLUMN transactions.exchange_rate IS 'Exchange rate used for USD conversion';
COMMENT ON COLUMN transactions.exchange_rate_date IS 'Date of the exchange rate used';

-- Step 3: Create index for filtering by currency
CREATE INDEX IF NOT EXISTS idx_transactions_currency
ON transactions(currency)
WHERE currency IS NOT NULL;

-- Step 4: Create index for finding unconverted transactions
CREATE INDEX IF NOT EXISTS idx_transactions_usd_conversion
ON transactions(amount_usd)
WHERE amount_usd IS NULL AND currency IS NOT NULL;

-- Step 5: Verify the changes
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'transactions'
  AND column_name IN ('currency', 'amount_usd', 'exchange_rate', 'exchange_rate_date')
ORDER BY ordinal_position;

-- Step 6: Check how many transactions need conversion
SELECT
  currency,
  COUNT(*) as total_transactions,
  COUNT(amount_usd) as converted_transactions,
  COUNT(*) FILTER (WHERE amount_usd IS NULL AND currency IS NOT NULL) as pending_conversion
FROM transactions
GROUP BY currency;
