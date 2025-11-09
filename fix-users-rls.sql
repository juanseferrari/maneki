-- Fix RLS policies for users table to allow INSERT operations
-- Run this in your Supabase SQL Editor

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert profile" ON users;

-- Create policy: Allow anyone to insert new users (needed for OAuth registration)
CREATE POLICY "Users can insert profile"
  ON users
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Create policy: Users can view all profiles (needed for the app to work)
CREATE POLICY "Users can view own profile"
  ON users
  FOR SELECT
  TO public
  USING (true);

-- Create policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- Verify policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'users';
