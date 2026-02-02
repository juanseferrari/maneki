-- Add updated_at field to automation_jobs if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'automation_jobs'
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE automation_jobs
    ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

    RAISE NOTICE 'Added updated_at column to automation_jobs';
  ELSE
    RAISE NOTICE 'Column updated_at already exists';
  END IF;
END $$;

-- Update existing rows to have updated_at = created_at
UPDATE automation_jobs
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Fix the trigger to use the correct function name
DROP TRIGGER IF EXISTS automation_jobs_updated_at ON automation_jobs;

CREATE TRIGGER automation_jobs_updated_at
  BEFORE UPDATE ON automation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_jobs_updated_at();

COMMENT ON COLUMN automation_jobs.updated_at IS 'Timestamp when the job was last updated';
