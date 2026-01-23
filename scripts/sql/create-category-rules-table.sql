-- =====================================================
-- MIGRATION: Create category_rules table
-- Purpose: Store auto-categorization rules per user
-- =====================================================

-- Create category_rules table
CREATE TABLE IF NOT EXISTS category_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  match_field TEXT DEFAULT 'both' CHECK (match_field IN ('description', 'merchant', 'both')),
  priority INTEGER DEFAULT 0,
  case_sensitive BOOLEAN DEFAULT FALSE,
  is_regex BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate keywords for same category
  UNIQUE(user_id, keyword, category_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_category_rules_user_id
  ON category_rules(user_id);

CREATE INDEX IF NOT EXISTS idx_category_rules_category_id
  ON category_rules(category_id);

CREATE INDEX IF NOT EXISTS idx_category_rules_priority
  ON category_rules(user_id, priority DESC);

-- Add RLS (Row Level Security) policies
ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own rules
CREATE POLICY "Users can view own category rules"
  ON category_rules
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own rules
CREATE POLICY "Users can insert own category rules"
  ON category_rules
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own rules
CREATE POLICY "Users can update own category rules"
  ON category_rules
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own rules
CREATE POLICY "Users can delete own category rules"
  ON category_rules
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment to table
COMMENT ON TABLE category_rules IS 'Auto-categorization rules for transactions based on keywords';
COMMENT ON COLUMN category_rules.keyword IS 'Keyword to match in transaction (supports wildcards with is_regex)';
COMMENT ON COLUMN category_rules.match_field IS 'Where to search: description, merchant, or both';
COMMENT ON COLUMN category_rules.priority IS 'Higher priority rules are checked first (DESC order)';
COMMENT ON COLUMN category_rules.case_sensitive IS 'Whether keyword matching is case sensitive';
COMMENT ON COLUMN category_rules.is_regex IS 'Whether keyword is a regex pattern';

-- =====================================================
-- OPTIONAL: Add some example rules for testing
-- (Uncomment to use - replace USER_ID and CATEGORY_IDs)
-- =====================================================

/*
-- Example: Alimentación keywords
INSERT INTO category_rules (user_id, category_id, keyword, match_field, priority) VALUES
  ('USER_ID', 'ALIMENTACION_CATEGORY_ID', 'mercado', 'both', 10),
  ('USER_ID', 'ALIMENTACION_CATEGORY_ID', 'super', 'merchant', 10),
  ('USER_ID', 'ALIMENTACION_CATEGORY_ID', 'carrefour', 'merchant', 10),
  ('USER_ID', 'ALIMENTACION_CATEGORY_ID', 'coto', 'merchant', 10),
  ('USER_ID', 'ALIMENTACION_CATEGORY_ID', 'dia%', 'merchant', 10);

-- Example: Transporte keywords
INSERT INTO category_rules (user_id, category_id, keyword, match_field, priority) VALUES
  ('USER_ID', 'TRANSPORTE_CATEGORY_ID', 'uber', 'merchant', 10),
  ('USER_ID', 'TRANSPORTE_CATEGORY_ID', 'cabify', 'merchant', 10),
  ('USER_ID', 'TRANSPORTE_CATEGORY_ID', 'ypf', 'merchant', 10),
  ('USER_ID', 'TRANSPORTE_CATEGORY_ID', 'shell', 'merchant', 10);
*/
