# Automation Setup Guide

This guide explains how to set up the automated Linear → Claude → PR workflow for the Maneki project.

## Overview

The automation system allows you to:
1. Create issues in Linear with the `claude-auto` label
2. Claude automatically analyzes the codebase and implements the solution
3. Creates a PR with tests
4. Optionally auto-merges to production (Heroku)

## Prerequisites

- Node.js 18.x installed
- Linear workspace with API access
- GitHub repository with Actions enabled
- Heroku app for deployment
- Supabase project for database

## Step 1: Install Dependencies

```bash
npm install
```

This will install all required dependencies including:
- Jest for testing
- ESLint for code quality
- Anthropic SDK for Claude API
- Supertest for API testing

## Step 2: Configure Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

### Required Variables for Automation

```env
# Linear Integration
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxx
LINEAR_WEBHOOK_SECRET=your_webhook_secret_here

# Claude API
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx

# GitHub
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx

# Heroku
HEROKU_API_KEY=xxxxxxxxxxxxx
HEROKU_APP_NAME=your-app-name
HEROKU_EMAIL=your@email.com

# Supabase (existing)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Step 3: Setup Database Tables

Run the migration to create the automation tables:

```bash
node scripts/run-migrations.js
```

This will create:
- `automation_jobs` table - Tracks automation jobs
- `automation_metrics` table - Stores daily metrics
- Views and functions for querying

## Step 4: Configure GitHub Secrets

Add the following secrets to your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

Required secrets:
- `HEROKU_API_KEY` - Your Heroku API key
- `HEROKU_APP_NAME` - Your Heroku app name (e.g., maneki-36d85d517656)
- `HEROKU_EMAIL` - Your Heroku account email
- `LINEAR_API_KEY` - Your Linear API key
- `SUPABASE_URL_TEST` - Test Supabase project URL (optional)
- `SUPABASE_SERVICE_ROLE_KEY_TEST` - Test service role key (optional)
- `CODECOV_TOKEN` - Codecov token for coverage reports (optional)

## Step 5: Configure Linear Webhook

1. Go to Linear Settings → API → Webhooks
2. Create a new webhook:
   - **URL**: `https://your-app.herokuapp.com/api/webhooks/linear`
   - **Secret**: Use the value from `LINEAR_WEBHOOK_SECRET` in your `.env`
   - **Events**: Check `Issues` events
3. Save the webhook

## Step 6: Get Linear API Key

1. Go to Linear Settings → API → Personal API keys
2. Create a new key with full access
3. Copy the key and add it to your `.env` as `LINEAR_API_KEY`

## Step 7: Create GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with these scopes:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
3. Copy the token and add it to `.env` as `GITHUB_TOKEN`

## Step 8: Test the Setup

### Run Tests Locally

```bash
npm test
```

This should run all Jest tests and generate a coverage report.

### Run Linter

```bash
npm run lint
```

This will check code quality with ESLint.

### Test GitHub Actions

Push a commit to a branch and create a PR. The CI workflow should:
- Run lint checks
- Run tests with coverage
- Perform security audit
- Check build

## Step 9: Create Your First Automated Issue

1. Create a new issue in Linear
2. Add the label `claude-auto`
3. Write a clear description with:
   - What needs to be implemented
   - Acceptance criteria
   - Related files (if known)

Example issue:

**Title**: Add health check endpoint

**Description**:
```
Create a new health check endpoint for monitoring.

Requirements:
- Endpoint: GET /health
- Response: { status: "ok", timestamp: ISO8601 }
- No authentication required
- Add test

Related files:
- server-supabase.js (add route here)
```

**Labels**: `claude-auto`, `feature`, `backend`

4. Watch the Linear issue for automation updates (comments will be posted)
5. After ~20-30 minutes, a PR should be created and linked in the issue

## How It Works

### Workflow Diagram

```
Linear Issue (claude-auto label)
  ↓
Webhook triggers automation
  ↓
Claude analyzes codebase
  ↓
Claude implements changes
  ↓
Tests run locally
  ↓
PR created in GitHub
  ↓
GitHub Actions CI runs
  ↓
Auto-merge (if enabled) or awaits approval
  ↓
Deploy to Heroku
  ↓
Linear issue updated to "Deployed"
```

### Automation Phases

1. **Analyze** (5-10 min): Claude explores codebase, understands context
2. **Implement** (5-10 min): Claude writes code following existing patterns
3. **Test** (2-5 min): Runs Jest tests, checks coverage
4. **PR Creation** (1 min): Creates PR with Linear link
5. **Deploy** (3-5 min): GitHub Actions runs CI and deploys

### Total Time: ~20-30 minutes from issue creation to production

## Monitoring

### View Automation Jobs

Query the database:

```sql
SELECT * FROM automation_jobs_recent;
```

Or in your app, create an admin dashboard to view:
- Recent jobs
- Success rate
- Average completion time
- Failed jobs with errors

### Daily Metrics

The system automatically tracks daily metrics:

```sql
SELECT * FROM automation_metrics ORDER BY date DESC LIMIT 7;
```

Shows:
- Jobs created/succeeded/failed
- Average completion time
- Average Claude API calls
- Issue type breakdown

### Check Logs

**Heroku logs**:
```bash
heroku logs --tail --app your-app-name
```

**GitHub Actions**:
Go to Actions tab in your repository

**Linear comments**:
Check the issue for automation updates

## Configuration Options

### Auto-Merge vs Manual Approval

**Current setup**: Auto-merge enabled (first month trial)

**To enable manual approval** (after 1 month):

1. Go to GitHub Settings → Branches
2. Add branch protection rule for `main`:
   - Require pull request reviews: 1 approval
   - Require status checks to pass
3. PRs will await your approval before merging

### Adjust Test Coverage Threshold

Edit `jest.config.js`:

```javascript
coverageThreshold: {
  global: {
    branches: 60,  // Change this
    functions: 60,
    lines: 60,
    statements: 60
  }
}
```

### Change Automation Labels

Edit `services/linear-webhook.service.js`:

```javascript
const automationLabels = ['claude-auto', 'automate', 'automation'];
```

### Customize Issue Types

Edit `services/linear-webhook.service.js` in `detectIssueType()` method.

## Troubleshooting

### Webhook Not Triggering

1. Check Linear webhook configuration
2. Verify `LINEAR_WEBHOOK_SECRET` matches
3. Check Heroku logs for webhook errors
4. Test webhook manually using curl:

```bash
curl -X POST https://your-app.herokuapp.com/api/webhooks/linear \
  -H "Content-Type: application/json" \
  -H "Linear-Signature: test" \
  -d '{"type": "Issue", "action": "create", "data": {...}}'
```

### Tests Failing

1. Run tests locally: `npm test`
2. Check test coverage: `npm test -- --coverage`
3. Fix failing tests before pushing

### Claude API Errors

1. Verify `ANTHROPIC_API_KEY` is correct
2. Check API rate limits
3. Review error messages in Linear comments

### Deployment Failures

1. Check Heroku logs
2. Verify environment variables in Heroku
3. Ensure Procfile is correct
4. Check `HEROKU_API_KEY` is valid

### PR Not Created

1. Verify `GITHUB_TOKEN` has `repo` scope
2. Check automation job status in database
3. Review error messages in Linear comments

## Cost Estimates

### Claude API

- ~10-15 API calls per issue
- ~50K input tokens + 10K output tokens
- **Cost: ~$0.50-1.00 per automated issue**

### Heroku

- Free tier (Eco dyno): $0/month (with sleep)
- Basic dyno: $7/month (no sleep)

### GitHub Actions

- Free tier: 2,000 minutes/month
- Each automation: ~5-10 minutes
- **~200-400 automations per month on free tier**

## Maintenance

### Daily (2 minutes)
- Check automation_jobs for failures
- Review Linear issues marked "Blocked"

### Weekly (15 minutes)
- Review success rate metrics
- Check for patterns in failures
- Update automation scope if needed

### Monthly (30 minutes)
- Evaluate whether to enable manual approval
- Review Claude API costs
- Update issue templates based on learnings

## Next Steps

1. **Test with simple issues first** - Start with small, well-defined tasks
2. **Monitor closely for first week** - Check every automation for quality
3. **Adjust as needed** - Update prompts, labels, or thresholds
4. **Scale up gradually** - Increase automation scope over time
5. **Enable approval after 1 month** - Add manual review step

## Support

For issues or questions:
- Check Heroku logs
- Review Linear comments on failed issues
- Check GitHub Actions logs
- Query automation_jobs table for errors

---

**Ready to automate!** 🚀

Create your first Linear issue with the `claude-auto` label and watch the magic happen.
