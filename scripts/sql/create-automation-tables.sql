-- Migration: Create automation_jobs table for Claude automation workflow
-- Date: 2026-02-02
-- Purpose: Track automation jobs triggered from Linear issues

-- Create automation_jobs table
CREATE TABLE IF NOT EXISTS automation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Linear issue reference
  linear_issue_id TEXT NOT NULL,
  linear_issue_url TEXT NOT NULL,
  issue_title TEXT NOT NULL,
  issue_description TEXT,
  issue_type TEXT, -- 'feature' | 'bug' | 'refactor' | 'other'

  -- Job status tracking
  status TEXT NOT NULL DEFAULT 'pending',
  -- Status values: 'pending' | 'analyzing' | 'implementing' | 'testing' | 'pr_created' | 'merged' | 'deployed' | 'failed'

  -- Git/GitHub details
  branch_name TEXT,
  pr_number INTEGER,
  pr_url TEXT,

  -- Metrics
  claude_calls INTEGER DEFAULT 0,
  test_coverage_percent DECIMAL(5,2),

  -- Error handling
  error_message TEXT,
  error_step TEXT, -- Which step failed: 'analyze', 'implement', 'test', 'pr_create', 'deploy'

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Additional metadata (JSON)
  metadata JSONB,

  -- Constraints
  CONSTRAINT valid_status CHECK (
    status IN ('pending', 'analyzing', 'implementing', 'testing', 'pr_created', 'merged', 'deployed', 'failed')
  ),
  CONSTRAINT valid_issue_type CHECK (
    issue_type IN ('feature', 'bug', 'refactor', 'other') OR issue_type IS NULL
  ),
  CONSTRAINT valid_coverage CHECK (
    test_coverage_percent IS NULL OR (test_coverage_percent >= 0 AND test_coverage_percent <= 100)
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_automation_jobs_linear_issue ON automation_jobs(linear_issue_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON automation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_created_at ON automation_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_pr_number ON automation_jobs(pr_number);

-- Comments for documentation
COMMENT ON TABLE automation_jobs IS 'Tracks Claude automation jobs triggered from Linear issues';
COMMENT ON COLUMN automation_jobs.linear_issue_id IS 'Linear issue ID (e.g., MAN-123)';
COMMENT ON COLUMN automation_jobs.status IS 'Current status of the automation job';
COMMENT ON COLUMN automation_jobs.issue_type IS 'Type of issue: feature, bug, refactor, or other';
COMMENT ON COLUMN automation_jobs.claude_calls IS 'Number of Claude API calls made for this job';
COMMENT ON COLUMN automation_jobs.test_coverage_percent IS 'Test coverage percentage achieved';
COMMENT ON COLUMN automation_jobs.error_step IS 'Step where the job failed if status is failed';
COMMENT ON COLUMN automation_jobs.metadata IS 'Additional metadata including team, labels, assignee, etc.';

-- Create automation_metrics table for tracking success rates
CREATE TABLE IF NOT EXISTS automation_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Time period
  date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Success metrics
  jobs_created INTEGER DEFAULT 0,
  jobs_succeeded INTEGER DEFAULT 0,
  jobs_failed INTEGER DEFAULT 0,

  -- Performance metrics
  avg_completion_time_minutes DECIMAL(10,2),
  avg_claude_calls DECIMAL(5,2),
  avg_test_coverage DECIMAL(5,2),

  -- Issue type breakdown
  features_completed INTEGER DEFAULT 0,
  bugs_fixed INTEGER DEFAULT 0,
  refactors_completed INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint on date
  CONSTRAINT unique_automation_metrics_date UNIQUE(date)
);

-- Index for date queries
CREATE INDEX IF NOT EXISTS idx_automation_metrics_date ON automation_metrics(date DESC);

-- Comments
COMMENT ON TABLE automation_metrics IS 'Daily aggregated metrics for automation performance tracking';
COMMENT ON COLUMN automation_metrics.avg_completion_time_minutes IS 'Average time from job creation to completion';
COMMENT ON COLUMN automation_metrics.avg_claude_calls IS 'Average number of Claude API calls per job';

-- Function to update automation metrics (can be called by cron job)
CREATE OR REPLACE FUNCTION update_automation_metrics()
RETURNS void AS $$
DECLARE
  today DATE := CURRENT_DATE;
  prev_date DATE := CURRENT_DATE - INTERVAL '1 day';
BEGIN
  -- Insert or update metrics for previous day
  INSERT INTO automation_metrics (
    date,
    jobs_created,
    jobs_succeeded,
    jobs_failed,
    avg_completion_time_minutes,
    avg_claude_calls,
    avg_test_coverage,
    features_completed,
    bugs_fixed,
    refactors_completed
  )
  SELECT
    prev_date,
    COUNT(*) as jobs_created,
    COUNT(*) FILTER (WHERE status IN ('merged', 'deployed')) as jobs_succeeded,
    COUNT(*) FILTER (WHERE status = 'failed') as jobs_failed,
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 60) FILTER (WHERE completed_at IS NOT NULL) as avg_completion_time_minutes,
    AVG(claude_calls) FILTER (WHERE claude_calls > 0) as avg_claude_calls,
    AVG(test_coverage_percent) FILTER (WHERE test_coverage_percent IS NOT NULL) as avg_test_coverage,
    COUNT(*) FILTER (WHERE issue_type = 'feature' AND status IN ('merged', 'deployed')) as features_completed,
    COUNT(*) FILTER (WHERE issue_type = 'bug' AND status IN ('merged', 'deployed')) as bugs_fixed,
    COUNT(*) FILTER (WHERE issue_type = 'refactor' AND status IN ('merged', 'deployed')) as refactors_completed
  FROM automation_jobs
  WHERE DATE(created_at) = prev_date
  ON CONFLICT (date) DO UPDATE SET
    jobs_created = EXCLUDED.jobs_created,
    jobs_succeeded = EXCLUDED.jobs_succeeded,
    jobs_failed = EXCLUDED.jobs_failed,
    avg_completion_time_minutes = EXCLUDED.avg_completion_time_minutes,
    avg_claude_calls = EXCLUDED.avg_claude_calls,
    avg_test_coverage = EXCLUDED.avg_test_coverage,
    features_completed = EXCLUDED.features_completed,
    bugs_fixed = EXCLUDED.bugs_fixed,
    refactors_completed = EXCLUDED.refactors_completed,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_automation_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER automation_jobs_updated_at
  BEFORE UPDATE ON automation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_jobs_updated_at();

-- Grant permissions (adjust based on your RLS setup)
-- For now, assuming service role will handle these operations

-- View for easy querying of recent jobs
CREATE OR REPLACE VIEW automation_jobs_recent AS
SELECT
  id,
  linear_issue_id,
  issue_title,
  issue_type,
  status,
  branch_name,
  pr_url,
  claude_calls,
  test_coverage_percent,
  error_message,
  EXTRACT(EPOCH FROM (completed_at - started_at)) / 60 as duration_minutes,
  created_at
FROM automation_jobs
ORDER BY created_at DESC
LIMIT 50;

COMMENT ON VIEW automation_jobs_recent IS 'Recent 50 automation jobs with calculated duration';
