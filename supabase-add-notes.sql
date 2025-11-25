-- Add notes column to transactions table
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add index for notes search (optional but helpful for performance)
CREATE INDEX IF NOT EXISTS idx_transactions_notes ON transactions USING gin(to_tsvector('spanish', notes));
