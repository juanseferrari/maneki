# Deployment Guide - Automation System

This guide walks you through deploying the automation system to production.

## Prerequisites Checklist

Before deploying, ensure you have:

- [x] Linear workspace configured with webhook
- [x] Linear API key (`LINEAR_API_KEY`)
- [x] Linear webhook secret (`LINEAR_WEBHOOK_SECRET`)
- [ ] Claude API key (`ANTHROPIC_API_KEY`) - **REQUIRED**
- [ ] GitHub Personal Access Token (`GITHUB_TOKEN`) - **REQUIRED**
- [x] Heroku app created
- [x] Heroku API key
- [ ] GitHub CLI (`gh`) installed
- [ ] Heroku CLI installed

## Missing Credentials

You need to complete these in your `.env` file:

### 1. Claude API Key (REQUIRED)

Get your API key from [https://console.anthropic.com/](https://console.anthropic.com/)

Add to `.env`:
```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
```

### 2. GitHub Personal Access Token (REQUIRED)

Create token at: [https://github.com/settings/tokens/new](https://github.com/settings/tokens/new)

Required scopes:
- `repo` (Full control of private repositories)
- `workflow` (Update GitHub Action workflows)

Add to `.env`:
```
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
```

## Step-by-Step Deployment

### Step 1: Complete Environment Variables

Edit `.env` and add the missing keys:

```bash
# Open .env in your editor
code .env

# Add these lines (with your actual keys):
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Run Tests Locally

```bash
# Run all tests
npm test

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix
```

Make sure all tests pass before deploying!

### Step 4: Run Database Migrations

You need to create the `automation_jobs` and `automation_metrics` tables.

**Option A: Using Supabase SQL Editor (Recommended)**

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: `adgxouvmnkhcqfyyfrfo`
3. Go to SQL Editor
4. Click "New Query"
5. Copy the contents of `scripts/sql/create-automation-tables.sql`
6. Paste and run

**Option B: Using migration script**

```bash
node scripts/run-migrations.js
```

Note: This may require manual execution in Supabase SQL Editor.

### Step 5: Configure Heroku Environment Variables

Run the setup script:

```bash
./scripts/setup-heroku.sh
```

Or manually set the variables:

```bash
heroku config:set \
  ANTHROPIC_API_KEY=your_key \
  LINEAR_API_KEY=lin_api_xxxxx \
  LINEAR_WEBHOOK_SECRET=lin_wh_xxxxx \
  GITHUB_TOKEN=ghp_xxxxx \
  --app maneki
```

Verify configuration:

```bash
heroku config --app maneki
```

### Step 6: Configure GitHub Secrets

Run the setup script:

```bash
./scripts/setup-github-secrets.sh
```

Or manually via GitHub UI:

1. Go to: https://github.com/juanseferrari/maneki/settings/secrets/actions
2. Add these secrets:
   - `HEROKU_API_KEY`
   - `HEROKU_APP_NAME`
   - `HEROKU_EMAIL`
   - `LINEAR_API_KEY`
   - `SUPABASE_URL_TEST` (optional)
   - `SUPABASE_SERVICE_ROLE_KEY_TEST` (optional)

### Step 7: Commit and Push Changes

```bash
# Add all new files
git add .

# Commit
git commit -m "Add automation system

- Add Jest testing infrastructure
- Add GitHub Actions CI/CD
- Add Linear integration services
- Add Claude automation orchestrator
- Add webhook endpoint

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to GitHub
git push origin main
```

This will trigger:
1. GitHub Actions CI (tests, lint, security scan)
2. Deployment to Heroku (if CI passes)

### Step 8: Monitor Deployment

**Check GitHub Actions:**
```bash
# Open in browser
gh run watch
```

Or visit: https://github.com/juanseferrari/maneki/actions

**Check Heroku Logs:**
```bash
heroku logs --tail --app maneki
```

### Step 9: Verify Deployment

Check if the server is running:

```bash
curl https://maneki.herokuapp.com/health
```

Or visit in browser: https://maneki.herokuapp.com

### Step 10: Test Linear Webhook

Test the webhook endpoint:

```bash
curl -X POST https://maneki.herokuapp.com/api/webhooks/linear \
  -H "Content-Type: application/json" \
  -H "Linear-Signature: test" \
  -d '{
    "type": "Issue",
    "action": "create",
    "data": {
      "id": "test-id",
      "identifier": "TEST-1",
      "title": "Test Issue",
      "url": "https://linear.app/test",
      "labels": [{"name": "claude-auto"}],
      "state": {"name": "Todo"}
    }
  }'
```

Check logs:
```bash
heroku logs --tail --app maneki | grep "Linear"
```

## Verification Checklist

After deployment, verify:

- [ ] CI/CD pipeline passes on GitHub Actions
- [ ] Heroku app is running (check logs)
- [ ] Environment variables are set in Heroku
- [ ] Database tables created (`automation_jobs`, `automation_metrics`)
- [ ] Linear webhook configured and accessible
- [ ] Test webhook returns 200 OK
- [ ] Logs show webhook received and processed

## Testing with Real Linear Issue

### Step 1: Create Test Issue

1. Go to your Linear workspace
2. Create a new issue:
   - **Title**: "Add health check endpoint"
   - **Description**:
     ```
     Create a simple health check endpoint for monitoring.

     Requirements:
     - Endpoint: GET /health
     - Response: { "status": "ok", "timestamp": "ISO8601" }
     - No authentication required

     Related files:
     - server-supabase.js (add route here)
     ```
   - **Labels**: Add `claude-auto` label
   - **Status**: Set to "Todo"

### Step 2: Monitor Automation

Watch for Linear comments:
- Within 5 minutes: "Analyzing issue and exploring codebase"
- Within 10 minutes: "Implementing solution"
- Within 15 minutes: "Running tests"
- Within 20 minutes: "Creating pull request"

Check logs:
```bash
heroku logs --tail --app maneki | grep "Automation"
```

### Step 3: Review PR

After ~20-30 minutes, you should see:
1. A new branch created: `automation/linear-test-1-add-health-check-endpoint`
2. A PR created with:
   - Title: `[TEST-1] Add health check endpoint`
   - Description with Linear issue link
   - Label: `automated`, `claude`
3. CI running on the PR

### Step 4: Check Results

If successful:
- PR is created and linked in Linear issue
- Tests pass
- Coverage >= 60%
- PR auto-merges (or awaits your approval)
- Deploys to Heroku

If failed:
- Error comment posted in Linear issue
- Job status = 'failed' in `automation_jobs` table
- Check error message and logs

## Troubleshooting

### Issue: Tests fail on CI

**Solution:**
```bash
# Run tests locally first
npm test

# Fix any failing tests
# Then commit and push
```

### Issue: Heroku deployment fails

**Check:**
```bash
# View deployment logs
heroku logs --tail --app maneki

# Check dynos status
heroku ps --app maneki

# Restart if needed
heroku restart --app maneki
```

### Issue: Linear webhook not triggering

**Check:**
1. Webhook configured in Linear settings
2. URL is correct: `https://maneki.herokuapp.com/api/webhooks/linear`
3. Secret matches `LINEAR_WEBHOOK_SECRET` in Heroku
4. Heroku logs show webhook received

**Test manually:**
```bash
# Use curl to send test webhook
curl -X POST https://maneki.herokuapp.com/api/webhooks/linear \
  -H "Content-Type: application/json" \
  -d @scripts/test-webhook-payload.json
```

### Issue: Claude automation fails

**Check:**
1. `ANTHROPIC_API_KEY` is set correctly in Heroku
2. API key is valid and has credits
3. Check Claude API usage at: https://console.anthropic.com/
4. Review error in Linear comment

### Issue: PR creation fails

**Check:**
1. `GITHUB_TOKEN` is set in Heroku
2. Token has `repo` scope
3. Token is not expired
4. GitHub CLI (`gh`) is available in Heroku environment

### Issue: Coverage too low

**Solution:**
The orchestrator will write tests, but if coverage is below 60%:
1. Check the test files generated
2. Manually add more tests if needed
3. Or lower the threshold temporarily in `jest.config.js`

## Monitoring

### View Recent Jobs

Query via API:
```bash
curl https://maneki.herokuapp.com/api/automation/jobs \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN"
```

Or query database directly:
```sql
SELECT * FROM automation_jobs_recent;
```

### View Metrics

```sql
SELECT * FROM automation_metrics
ORDER BY date DESC
LIMIT 7;
```

### Daily Health Check

Run this daily:

```bash
# Check Heroku dyno status
heroku ps --app maneki

# Check recent errors
heroku logs --app maneki --num 100 | grep ERROR

# Check automation job success rate
# (Query automation_metrics table)
```

## Cost Monitoring

### Claude API Costs

Monitor at: https://console.anthropic.com/settings/usage

Expected costs:
- ~$0.50-1.00 per automated issue
- ~$15-30/month for 30 issues

### Heroku Costs

Current plan: Eco dyno ($5/month)

Check usage:
```bash
heroku ps:autoscale --app maneki
```

### GitHub Actions

Free tier: 2,000 minutes/month
Each run: ~5-10 minutes
Capacity: ~200-400 automation runs/month

## Next Steps

After successful deployment:

1. **Monitor for 1 week** - Watch for any errors or issues
2. **Create 3-5 test issues** - Validate different types (feature, bug, refactor)
3. **Review PRs** - Check code quality and test coverage
4. **Adjust as needed** - Update prompts, thresholds, or labels
5. **Enable manual approval** (after 1 month) - Add branch protection rules

## Support

If you encounter issues:

1. **Check logs:**
   - Heroku: `heroku logs --tail --app maneki`
   - GitHub Actions: https://github.com/juanseferrari/maneki/actions
   - Linear: Issue comments

2. **Review documentation:**
   - [AUTOMATION_SETUP.md](AUTOMATION_SETUP.md) - Detailed setup guide
   - [README.md](README.md) - Project overview

3. **Debug automation jobs:**
   ```sql
   -- Find failed jobs
   SELECT * FROM automation_jobs WHERE status = 'failed';

   -- Check error messages
   SELECT error_message, error_step FROM automation_jobs WHERE error_message IS NOT NULL;
   ```

---

**You're ready to automate!** 🚀

Once everything is deployed, create your first automated issue in Linear and watch the magic happen.
