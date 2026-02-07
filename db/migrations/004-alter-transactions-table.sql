-- Migration: Alter transactions table to add review flags
-- Purpose: Track transactions that need review and those processed by Claude
-- Date: 2026-02-06

-- Add needs_review flag for transactions requiring user confirmation
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;

-- Add processed_by_claude flag to track extraction method
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS processed_by_claude BOOLEAN DEFAULT FALSE;

-- Create partial index for transactions needing review (for performance)
CREATE INDEX IF NOT EXISTS idx_transactions_needs_review
  ON transactions(needs_review)
  WHERE needs_review = TRUE;

-- Create index for Claude-processed transactions
CREATE INDEX IF NOT EXISTS idx_transactions_processed_by_claude
  ON transactions(processed_by_claude)
  WHERE processed_by_claude = TRUE;

-- Create composite index for user + needs_review queries
CREATE INDEX IF NOT EXISTS idx_transactions_user_needs_review
  ON transactions(user_id, needs_review)
  WHERE needs_review = TRUE;

-- Comments for documentation
COMMENT ON COLUMN transactions.needs_review IS 'True if transaction requires user review before finalization (low confidence or Claude-extracted)';
COMMENT ON COLUMN transactions.processed_by_claude IS 'True if transaction was extracted by Claude API (vs template matching)';

-- Function to get transactions needing review for a file
CREATE OR REPLACE FUNCTION get_file_transactions_for_review(p_file_id UUID, p_user_id UUID)
RETURNS TABLE (
  id UUID,
  file_id UUID,
  date DATE,
  description TEXT,
  amount NUMERIC,
  type TEXT,
  category_id UUID,
  category_name TEXT,
  needs_review BOOLEAN,
  processed_by_claude BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.file_id,
    t.date,
    t.description,
    t.amount,
    t.type,
    t.category_id,
    c.name as category_name,
    t.needs_review,
    t.processed_by_claude,
    t.created_at
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  WHERE t.file_id = p_file_id
    AND t.user_id = p_user_id
  ORDER BY t.date DESC, t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_file_transactions_for_review IS 'Gets all transactions for a file with category names for review modal';
