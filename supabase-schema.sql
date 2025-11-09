-- Database Schema for Bank Statement Processing
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Files table: stores metadata about uploaded files
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,

  -- Processing status
  processing_status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  processing_error TEXT,
  confidence_score DECIMAL(5,2), -- 0.00 to 100.00

  -- Metadata
  bank_name TEXT,
  statement_date DATE,

  -- Multi-user support (for future)
  user_id UUID, -- Will be populated when auth is added

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transactions table: stores normalized transaction data
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,

  -- Transaction details
  transaction_date DATE NOT NULL,
  description TEXT NOT NULL,
  merchant TEXT,
  amount DECIMAL(12,2) NOT NULL, -- Positive for credits, negative for debits
  transaction_type TEXT, -- debit, credit
  balance DECIMAL(12,2),

  -- Additional fields
  reference_number TEXT,
  card_number TEXT,
  category TEXT, -- For future categorization

  -- Metadata
  raw_data JSONB, -- Store original extracted data
  confidence_score DECIMAL(5,2),

  -- Multi-user support (for future)
  user_id UUID, -- Will be populated when auth is added

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_processing_status ON files(processing_status);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_file_id ON transactions(file_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to auto-update updated_at
DROP TRIGGER IF EXISTS update_files_updated_at ON files;
CREATE TRIGGER update_files_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) for multi-user support
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for now, will restrict when auth is added)
CREATE POLICY "Allow all operations on files for now"
  ON files
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on transactions for now"
  ON transactions
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Verify tables were created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('files', 'transactions');
