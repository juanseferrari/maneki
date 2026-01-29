-- =====================================================
-- CREATE TABLE: exchange_rates
-- Purpose: Cache exchange rates for multi-currency support
-- =====================================================

-- Create exchange_rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  currency_from VARCHAR(3) NOT NULL,
  currency_to VARCHAR(3) NOT NULL DEFAULT 'USD',
  rate DECIMAL(10, 6) NOT NULL,
  source VARCHAR(100) DEFAULT 'dolarapi.com',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique rate per date and currency pair
  UNIQUE (date, currency_from, currency_to)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date_currency
ON exchange_rates(date, currency_from, currency_to);

-- Add comment
COMMENT ON TABLE exchange_rates IS 'Stores daily exchange rates for currency conversion';

-- Enable RLS (Row Level Security)
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read exchange rates (they are public data)
CREATE POLICY "Exchange rates are publicly readable"
ON exchange_rates FOR SELECT
TO authenticated
USING (true);

-- Policy: Only service role can insert/update rates
CREATE POLICY "Only service role can modify exchange rates"
ON exchange_rates FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Verify table structure
SELECT
  column_name,
  data_type,
  character_maximum_length,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'exchange_rates'
ORDER BY ordinal_position;
