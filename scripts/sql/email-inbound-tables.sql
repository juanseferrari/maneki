-- ============================================
-- Email Inbound Tables for Maneki
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Create user_settings table (if not exists)
-- Stores per-user settings including email upload token
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_upload_token VARCHAR(20) UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 2. Create email_inbound_logs table
-- Logs all incoming email events for debugging and analytics
CREATE TABLE IF NOT EXISTS email_inbound_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_email VARCHAR(255),
  subject TEXT,
  attachment_count INTEGER DEFAULT 0,
  processed_files JSONB DEFAULT '[]',
  status VARCHAR(50) DEFAULT 'pending',
  error_message TEXT,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Add upload_source and upload_metadata columns to files table (if not exist)
DO $$
BEGIN
  -- Add upload_source column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'files' AND column_name = 'upload_source'
  ) THEN
    ALTER TABLE files ADD COLUMN upload_source VARCHAR(50) DEFAULT 'web';
  END IF;

  -- Add upload_metadata column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'files' AND column_name = 'upload_metadata'
  ) THEN
    ALTER TABLE files ADD COLUMN upload_metadata JSONB DEFAULT NULL;
  END IF;
END $$;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_email_token ON user_settings(email_upload_token);
CREATE INDEX IF NOT EXISTS idx_email_inbound_logs_user_id ON email_inbound_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_inbound_logs_created_at ON email_inbound_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_upload_source ON files(upload_source);

-- 5. Enable RLS on new tables
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_inbound_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for user_settings
-- Drop existing policies first (if any)
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
DROP POLICY IF EXISTS "Service role full access to user_settings" ON user_settings;

-- Users can only see their own settings
CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own settings
CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own settings
CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can do everything (for backend operations)
CREATE POLICY "Service role full access to user_settings"
  ON user_settings FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 7. RLS Policies for email_inbound_logs
-- Drop existing policies first (if any)
DROP POLICY IF EXISTS "Users can view own email logs" ON email_inbound_logs;
DROP POLICY IF EXISTS "Service role can insert email logs" ON email_inbound_logs;
DROP POLICY IF EXISTS "Service role full access to email_logs" ON email_inbound_logs;

-- Users can only see their own logs
CREATE POLICY "Users can view own email logs"
  ON email_inbound_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert logs (for webhook)
CREATE POLICY "Service role can insert email logs"
  ON email_inbound_logs FOR INSERT
  WITH CHECK (true);

-- Service role full access
CREATE POLICY "Service role full access to email_logs"
  ON email_inbound_logs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 8. Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Trigger for user_settings updated_at
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Verification Queries (run these to check)
-- ============================================

-- Check tables exist
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('user_settings', 'email_inbound_logs');

-- Check files table has new columns
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'files' AND column_name IN ('upload_source', 'upload_metadata');
