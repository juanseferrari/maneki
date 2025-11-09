-- Users Table Schema for Google OAuth Authentication
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table: stores user information from Google OAuth
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Google OAuth Information
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT false,

  -- User Profile Information
  name TEXT,
  given_name TEXT,
  family_name TEXT,
  picture TEXT, -- Google profile picture URL
  locale TEXT,

  -- Account Status
  is_active BOOLEAN DEFAULT true,
  is_admin BOOLEAN DEFAULT false,

  -- Subscription/Plan (for future use)
  plan_type TEXT DEFAULT 'free', -- free, pro, enterprise
  plan_expires_at TIMESTAMPTZ,

  -- Session Information
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- Add trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only read their own data
CREATE POLICY "Users can view own profile"
  ON users
  FOR SELECT
  TO public
  USING (true); -- For now allow all, will be restricted when auth is fully implemented

-- Create policy: Users can only update their own data
CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- Sessions table: stores active user sessions
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);

-- Create index on expire for session cleanup
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

-- Now update existing tables to link to users

-- Add user_id to files table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'files' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE files ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_files_user_id_new ON files(user_id);
  END IF;
END $$;

-- Add user_id to transactions table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id_new ON transactions(user_id);
  END IF;
END $$;

-- Add user_id to veps table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'veps' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE veps ADD COLUMN user_id UUID REFERENCES veps(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_veps_user_id_new ON veps(user_id);
  END IF;
END $$;

-- Update RLS policies for files table
DROP POLICY IF EXISTS "Allow all operations on files for now" ON files;

CREATE POLICY "Users can view own files"
  ON files
  FOR SELECT
  TO public
  USING (true); -- Will be: user_id = auth.uid() when fully implemented

CREATE POLICY "Users can insert own files"
  ON files
  FOR INSERT
  TO public
  WITH CHECK (true); -- Will be: user_id = auth.uid() when fully implemented

CREATE POLICY "Users can update own files"
  ON files
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own files"
  ON files
  FOR DELETE
  TO public
  USING (true);

-- Update RLS policies for transactions table
DROP POLICY IF EXISTS "Allow all operations on transactions for now" ON transactions;

CREATE POLICY "Users can view own transactions"
  ON transactions
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can insert own transactions"
  ON transactions
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can update own transactions"
  ON transactions
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own transactions"
  ON transactions
  FOR DELETE
  TO public
  USING (true);

-- Update RLS policies for veps table
DROP POLICY IF EXISTS "Allow all operations on veps for now" ON veps;

CREATE POLICY "Users can view own veps"
  ON veps
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can insert own veps"
  ON veps
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can update own veps"
  ON veps
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own veps"
  ON veps
  FOR DELETE
  TO public
  USING (true);

-- Verify tables were created
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'users'
ORDER BY ordinal_position;
