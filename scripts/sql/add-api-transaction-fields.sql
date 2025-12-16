-- ============================================
-- Add API Integration Fields to Transactions
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add source column to track where transaction came from
-- Values: 'file_upload', 'mercadopago', 'mercury', 'enable_banking', etc.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'source'
  ) THEN
    ALTER TABLE transactions ADD COLUMN source VARCHAR(50) DEFAULT 'file_upload';
    COMMENT ON COLUMN transactions.source IS 'Origin of transaction: file_upload, mercadopago, mercury, enable_banking';
  END IF;
END $$;

-- 2. Add connection_id to link API transactions to their connection
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'connection_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN connection_id UUID REFERENCES connections(id) ON DELETE SET NULL;
    COMMENT ON COLUMN transactions.connection_id IS 'Reference to the connection used to fetch this transaction';
  END IF;
END $$;

-- 3. Add provider_transaction_id for deduplication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'provider_transaction_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN provider_transaction_id VARCHAR(255);
    COMMENT ON COLUMN transactions.provider_transaction_id IS 'Unique transaction ID from the provider (for deduplication)';
  END IF;
END $$;

-- 4. Add currency column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'currency'
  ) THEN
    ALTER TABLE transactions ADD COLUMN currency VARCHAR(10) DEFAULT 'ARS';
    COMMENT ON COLUMN transactions.currency IS 'Currency code: ARS, USD, EUR, etc.';
  END IF;
END $$;

-- 5. Add status column for payment status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'status'
  ) THEN
    ALTER TABLE transactions ADD COLUMN status VARCHAR(50);
    COMMENT ON COLUMN transactions.status IS 'Transaction status from provider: approved, pending, rejected, etc.';
  END IF;
END $$;

-- 6. Add payment_method column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE transactions ADD COLUMN payment_method VARCHAR(100);
    COMMENT ON COLUMN transactions.payment_method IS 'Payment method: credit_card, debit_card, account_money, bank_transfer, etc.';
  END IF;
END $$;

-- 7. Add operation_type column (for Mercado Pago)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'operation_type'
  ) THEN
    ALTER TABLE transactions ADD COLUMN operation_type VARCHAR(50);
    COMMENT ON COLUMN transactions.operation_type IS 'Type of operation: regular_payment, money_transfer, recurring_payment, etc.';
  END IF;
END $$;

-- 8. Add counterparty_id column (payer/collector from MP, counterparty from Mercury)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'counterparty_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN counterparty_id VARCHAR(255);
    COMMENT ON COLUMN transactions.counterparty_id IS 'ID of the other party in the transaction';
  END IF;
END $$;

-- 9. Add counterparty_name column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'counterparty_name'
  ) THEN
    ALTER TABLE transactions ADD COLUMN counterparty_name VARCHAR(255);
    COMMENT ON COLUMN transactions.counterparty_name IS 'Name of the other party in the transaction';
  END IF;
END $$;

-- 10. Add counterparty_email column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'counterparty_email'
  ) THEN
    ALTER TABLE transactions ADD COLUMN counterparty_email VARCHAR(255);
    COMMENT ON COLUMN transactions.counterparty_email IS 'Email of the other party (if available)';
  END IF;
END $$;

-- 11. Add external_reference column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'external_reference'
  ) THEN
    ALTER TABLE transactions ADD COLUMN external_reference VARCHAR(255);
    COMMENT ON COLUMN transactions.external_reference IS 'External reference from the provider';
  END IF;
END $$;

-- 12. Add account_id column (for multi-account support like Mercury)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN account_id VARCHAR(255);
    COMMENT ON COLUMN transactions.account_id IS 'Account ID from the provider (for multi-account support)';
  END IF;
END $$;

-- 13. Add account_name column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'account_name'
  ) THEN
    ALTER TABLE transactions ADD COLUMN account_name VARCHAR(255);
    COMMENT ON COLUMN transactions.account_name IS 'Account name from the provider';
  END IF;
END $$;

-- 14. Make file_id nullable (API transactions don't come from files)
-- Check if file_id is NOT NULL and alter if needed
DO $$
BEGIN
  -- file_id should already be nullable, but just to be safe
  ALTER TABLE transactions ALTER COLUMN file_id DROP NOT NULL;
EXCEPTION
  WHEN others THEN
    NULL; -- Column is already nullable
END $$;

-- ============================================
-- Create Indexes for Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source);
CREATE INDEX IF NOT EXISTS idx_transactions_connection_id ON transactions(connection_id);
CREATE INDEX IF NOT EXISTS idx_transactions_provider_transaction_id ON transactions(provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_currency ON transactions(currency);

-- Unique constraint to prevent duplicate API transactions
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_provider_unique
  ON transactions(user_id, source, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

-- ============================================
-- Verification Queries (run these to check)
-- ============================================

-- Check transactions table has new columns
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'transactions'
-- AND column_name IN ('source', 'connection_id', 'provider_transaction_id', 'currency', 'status', 'payment_method');
