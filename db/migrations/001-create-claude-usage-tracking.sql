-- Migration: Create claude_usage_tracking table
-- Purpose: Track Claude API usage per user per month for quota management
-- Date: 2026-02-06

CREATE TABLE IF NOT EXISTS claude_usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL, -- Format: 'YYYY-MM'
  usage_count INTEGER DEFAULT 0 CHECK (usage_count >= 0),
  monthly_limit INTEGER DEFAULT 20 CHECK (monthly_limit > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_user_month UNIQUE (user_id, month_year)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_claude_usage_user_month
  ON claude_usage_tracking(user_id, month_year);

CREATE INDEX IF NOT EXISTS idx_claude_usage_month_year
  ON claude_usage_tracking(month_year);

-- Comments for documentation
COMMENT ON TABLE claude_usage_tracking IS 'Tracks Claude API usage per user per month for quota management';
COMMENT ON COLUMN claude_usage_tracking.month_year IS 'Month in YYYY-MM format (e.g., 2026-02)';
COMMENT ON COLUMN claude_usage_tracking.usage_count IS 'Number of Claude API calls made this month';
COMMENT ON COLUMN claude_usage_tracking.monthly_limit IS 'Maximum Claude API calls allowed per month (default: 20)';

-- RPC function for atomic increment
CREATE OR REPLACE FUNCTION increment_claude_usage(p_user_id UUID, p_month_year TEXT)
RETURNS TABLE (
  usage_count INTEGER,
  monthly_limit INTEGER,
  remaining INTEGER
) AS $$
DECLARE
  v_usage_count INTEGER;
  v_monthly_limit INTEGER;
BEGIN
  -- Insert or update usage count atomically
  INSERT INTO claude_usage_tracking (user_id, month_year, usage_count, monthly_limit)
  VALUES (p_user_id, p_month_year, 1, 20)
  ON CONFLICT (user_id, month_year)
  DO UPDATE SET
    usage_count = claude_usage_tracking.usage_count + 1,
    updated_at = NOW()
  RETURNING claude_usage_tracking.usage_count, claude_usage_tracking.monthly_limit
  INTO v_usage_count, v_monthly_limit;

  -- Return current state
  RETURN QUERY SELECT
    v_usage_count,
    v_monthly_limit,
    GREATEST(0, v_monthly_limit - v_usage_count) as remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_claude_usage IS 'Atomically increments Claude usage count and returns current state';

-- Enable Row Level Security
ALTER TABLE claude_usage_tracking ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own usage
CREATE POLICY claude_usage_select_own
  ON claude_usage_tracking
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own usage records
CREATE POLICY claude_usage_insert_own
  ON claude_usage_tracking
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own usage records
CREATE POLICY claude_usage_update_own
  ON claude_usage_tracking
  FOR UPDATE
  USING (auth.uid() = user_id);
