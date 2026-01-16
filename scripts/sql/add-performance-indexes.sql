-- Performance Optimization Indexes
-- Add composite indexes for common query patterns

-- Enable trigram extension for faster ILIKE queries (MUST BE FIRST)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Composite index for user_id + transaction_date (most common query)
-- This will speed up queries that filter by user and sort by date
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
ON transactions(user_id, transaction_date DESC);

-- Composite index for user_id + category (for category filtering)
CREATE INDEX IF NOT EXISTS idx_transactions_user_category
ON transactions(user_id, category);

-- Composite index for user_id + amount (for amount range queries)
CREATE INDEX IF NOT EXISTS idx_transactions_user_amount
ON transactions(user_id, amount);

-- Index for description searches (partial text search)
CREATE INDEX IF NOT EXISTS idx_transactions_description_trgm
ON transactions USING gin (description gin_trgm_ops);

-- Index for connection_id lookups
CREATE INDEX IF NOT EXISTS idx_transactions_connection_id
ON transactions(connection_id)
WHERE connection_id IS NOT NULL;

-- Verify indexes were created
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'transactions'
ORDER BY indexname;
