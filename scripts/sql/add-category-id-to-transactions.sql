-- =====================================================
-- MIGRATION: Add category_id to transactions table
-- Purpose: Enable auto-categorization of transactions
-- =====================================================

-- Add category_id column to transactions table
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_category_id
ON transactions(category_id);

-- Add comment
COMMENT ON COLUMN transactions.category_id IS 'Foreign key to categories table for auto-categorization';
