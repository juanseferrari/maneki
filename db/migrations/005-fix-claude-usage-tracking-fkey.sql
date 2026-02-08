-- Migration: Fix claude_usage_tracking foreign key constraint
-- Purpose: Change reference from non-existent public.users to auth.users
-- Date: 2026-02-08
-- Issue: User uploads failed with "violates foreign key constraint claude_usage_tracking_user_id_fkey"

-- Step 1: Drop the existing foreign key constraint
ALTER TABLE claude_usage_tracking
  DROP CONSTRAINT IF EXISTS claude_usage_tracking_user_id_fkey;

-- Step 2: Add new foreign key constraint referencing auth.users
-- Note: auth.users is the Supabase Auth table where users are actually stored
ALTER TABLE claude_usage_tracking
  ADD CONSTRAINT claude_usage_tracking_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- Similarly, fix other tables that might have the same issue

-- Fix installments table
ALTER TABLE installments
  DROP CONSTRAINT IF EXISTS installments_user_id_fkey;

ALTER TABLE installments
  ADD CONSTRAINT installments_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- Verify the constraints are correct
DO $$
BEGIN
  -- Test if we can query the constraint
  PERFORM 1
  FROM information_schema.table_constraints
  WHERE constraint_name = 'claude_usage_tracking_user_id_fkey'
  AND table_name = 'claude_usage_tracking';

  IF FOUND THEN
    RAISE NOTICE '✅ claude_usage_tracking foreign key constraint updated successfully';
  ELSE
    RAISE NOTICE '⚠️  Failed to create claude_usage_tracking foreign key constraint';
  END IF;
END$$;

COMMENT ON CONSTRAINT claude_usage_tracking_user_id_fkey ON claude_usage_tracking
  IS 'References auth.users (Supabase Auth table) instead of public.users';
