-- Migration: Create installments table
-- Purpose: Store installment information for transactions (e.g., "Cuota 1/12")
-- Date: 2026-02-06

CREATE TABLE IF NOT EXISTS installments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL CHECK (installment_number > 0),
  total_installments INTEGER NOT NULL CHECK (total_installments > 0),
  group_id UUID NOT NULL, -- Links related installments from the same purchase
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_installment_number CHECK (installment_number <= total_installments)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_installments_transaction
  ON installments(transaction_id);

CREATE INDEX IF NOT EXISTS idx_installments_group
  ON installments(group_id);

CREATE INDEX IF NOT EXISTS idx_installments_user
  ON installments(user_id);

CREATE INDEX IF NOT EXISTS idx_installments_user_group
  ON installments(user_id, group_id);

-- Comments for documentation
COMMENT ON TABLE installments IS 'Stores installment information for transactions (cuotas)';
COMMENT ON COLUMN installments.transaction_id IS 'References the transaction this installment belongs to';
COMMENT ON COLUMN installments.installment_number IS 'Current installment number (e.g., 1 in "Cuota 1/12")';
COMMENT ON COLUMN installments.total_installments IS 'Total number of installments (e.g., 12 in "Cuota 1/12")';
COMMENT ON COLUMN installments.group_id IS 'UUID that links all installments from the same purchase together';

-- Enable Row Level Security
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own installments
CREATE POLICY installments_select_own
  ON installments
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own installments
CREATE POLICY installments_insert_own
  ON installments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own installments
CREATE POLICY installments_update_own
  ON installments
  FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own installments
CREATE POLICY installments_delete_own
  ON installments
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to get all related installments by group_id
CREATE OR REPLACE FUNCTION get_installment_group(p_group_id UUID, p_user_id UUID)
RETURNS TABLE (
  id UUID,
  transaction_id UUID,
  installment_number INTEGER,
  total_installments INTEGER,
  transaction_description TEXT,
  transaction_amount NUMERIC,
  transaction_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.transaction_id,
    i.installment_number,
    i.total_installments,
    t.description as transaction_description,
    t.amount as transaction_amount,
    t.date as transaction_date
  FROM installments i
  INNER JOIN transactions t ON t.id = i.transaction_id
  WHERE i.group_id = p_group_id
    AND i.user_id = p_user_id
  ORDER BY i.installment_number ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_installment_group IS 'Gets all related installments for a given group_id with transaction details';
