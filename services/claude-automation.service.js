const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const LinearService = require('./linear.service');

// Lazy load Anthropic SDK to avoid errors if not installed
let Anthropic;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch (error) {
  console.warn('[ClaudeAutomation] @anthropic-ai/sdk not installed. Automation features will be disabled.');
  Anthropic = null;
}

/**
 * Claude Automation Service
 * Orchestrates the automated implementation of Linear issues using Claude
 */
class ClaudeAutomationService {
  constructor(supabaseService) {
    this.supabase = supabaseService;
    this.linearService = new LinearService();

    // Initialize Anthropic client if SDK is available
    if (Anthropic && process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
      this.model = 'claude-sonnet-4-5-20250929';
      this.maxTokens = 8000;
      console.log('[ClaudeAutomation] Service initialized successfully');
    } else {
      this.anthropic = null;
      console.warn('[ClaudeAutomation] Service initialized WITHOUT Anthropic SDK or API key');
    }
  }

  /**
   * Check if automation is available
   */
  isAvailable() {
    return this.anthropic !== null;
  }

  /**
   * Process a Linear issue through the automation workflow
   * @param {Object} job - Automation job record from database
   * @param {Object} issue - Linear issue data
   */
  async processIssue(job, issue) {
    console.log(`[ClaudeAutomation] Starting automation for job ${job.id}`);

    try {
      // Step 1: Analyze the issue and codebase
      await this.updateJobStatus(job.id, 'analyzing');
      await this.linearService.postAutomationUpdate(
        issue.id,
        '🔍',
        'Analyzing issue and exploring codebase',
        { step: 'Analysis Phase' }
      );

      const analysis = await this.analyzeIssue(job, issue);
      console.log(`[ClaudeAutomation] Analysis complete:`, analysis);

      // Step 2: Implement the solution
      await this.updateJobStatus(job.id, 'implementing');
      await this.linearService.postAutomationUpdate(
        issue.id,
        '⚙️',
        'Implementing solution',
        { step: 'Implementation Phase', details: analysis.summary }
      );

      const implementation = await this.implementSolution(job, issue, analysis);
      console.log(`[ClaudeAutomation] Implementation complete`);

      // Step 3: Run tests
      await this.updateJobStatus(job.id, 'testing');
      await this.linearService.postAutomationUpdate(
        issue.id,
        '🧪',
        'Running tests and checking coverage',
        { step: 'Testing Phase' }
      );

      const testResults = await this.runTests(job);
      console.log(`[ClaudeAutomation] Tests complete:`, testResults);

      if (!testResults.passed) {
        throw new Error(`Tests failed: ${testResults.error}`);
      }

      if (testResults.coverage < 60) {
        throw new Error(`Coverage too low: ${testResults.coverage}% (required: 60%)`);
      }

      // Step 4: Create PR
      await this.updateJobStatus(job.id, 'pr_created');
      await this.linearService.postAutomationUpdate(
        issue.id,
        '📝',
        'Creating pull request',
        { step: 'PR Creation' }
      );

      const pr = await this.createPullRequest(job, issue, implementation);
      console.log(`[ClaudeAutomation] PR created: ${pr.url}`);

      // Update job with PR info
      await this.updateJobWithPR(job.id, pr, testResults.coverage);

      // Final update in Linear
      await this.linearService.postAutomationUpdate(
        issue.id,
        '✅',
        'Pull request created successfully',
        {
          step: 'Completed',
          details: `Coverage: ${testResults.coverage}%`,
          links: {
            'Pull Request': pr.url,
            'Branch': pr.branchUrl
          }
        }
      );

      // Attach PR to Linear issue
      await this.linearService.createAttachment(
        issue.id,
        pr.url,
        `PR #${pr.number}: ${issue.title}`
      );

      console.log(`[ClaudeAutomation] Automation completed successfully for job ${job.id}`);

    } catch (error) {
      console.error(`[ClaudeAutomation] Error processing job ${job.id}:`, error);

      await this.updateJobStatus(job.id, 'failed', error.message, this.getCurrentStep(job));

      await this.linearService.postAutomationUpdate(
        issue.id,
        '❌',
        'Automation failed',
        {
          error: error.message,
          step: this.getCurrentStep(job),
          nextSteps: [
            'Check the error message above',
            'Review automation logs',
            'Try re-running by removing and re-adding the automation label',
            'If issue persists, implement manually'
          ]
        }
      );

      throw error;
    }
  }

  /**
   * Analyze the issue and explore codebase
   */
  async analyzeIssue(job, issue) {
    console.log(`[ClaudeAutomation] Analyzing issue ${issue.identifier}`);

    const prompt = this.buildAnalysisPrompt(issue);

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      await this.incrementClaudeCalls(job.id);

      const analysisText = response.content[0].text;

      return {
        summary: analysisText,
        filesNeeded: this.extractFilesFromAnalysis(analysisText),
        approach: analysisText
      };
    } catch (error) {
      console.error('[ClaudeAutomation] Analysis failed:', error);
      throw new Error(`Failed to analyze issue: ${error.message}`);
    }
  }

  /**
   * Implement the solution
   */
  async implementSolution(job, issue, analysis) {
    console.log(`[ClaudeAutomation] Implementing solution for ${issue.identifier}`);

    // Create feature branch
    const branchName = this.createBranchName(issue);
    await this.createBranch(branchName);

    const prompt = this.buildImplementationPrompt(issue, analysis);

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      await this.incrementClaudeCalls(job.id);

      const implementation = response.content[0].text;

      // Extract code changes and apply them
      const changes = this.extractCodeChanges(implementation);
      await this.applyCodeChanges(changes);

      // Commit changes
      await this.commitChanges(issue, branchName);

      // Update job with branch name
      await this.updateJobBranch(job.id, branchName);

      return {
        branchName,
        changes,
        summary: implementation
      };
    } catch (error) {
      console.error('[ClaudeAutomation] Implementation failed:', error);
      throw new Error(`Failed to implement solution: ${error.message}`);
    }
  }

  /**
   * Run tests and check coverage
   */
  async runTests(job) {
    console.log(`[ClaudeAutomation] Running tests`);

    try {
      // Run tests with coverage
      const output = execSync('npm test -- --coverage --json', {
        encoding: 'utf-8',
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      // Parse coverage from output
      const coverage = this.parseCoverage(output);

      return {
        passed: true,
        coverage,
        output
      };
    } catch (error) {
      console.error('[ClaudeAutomation] Tests failed:', error.message);

      return {
        passed: false,
        coverage: 0,
        error: error.message,
        output: error.stdout || error.stderr || error.message
      };
    }
  }

  /**
   * Create pull request on GitHub
   */
  async createPullRequest(job, issue, implementation) {
    console.log(`[ClaudeAutomation] Creating PR for ${issue.identifier}`);

    const branchName = implementation.branchName;
    const title = `[${issue.identifier}] ${issue.title}`;
    const body = this.buildPRDescription(issue, implementation);

    try {
      // Push branch to remote
      execSync(`git push -u origin ${branchName}`, {
        encoding: 'utf-8',
        cwd: process.cwd()
      });

      // Create PR using GitHub API instead of gh CLI
      const owner = this.getRepoOwner();
      const repo = this.getRepoName();

      const response = await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/pulls`,
        {
          title,
          body,
          head: branchName,
          base: 'main'
        },
        {
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      const prData = response.data;

      // Add labels to PR
      try {
        await axios.post(
          `https://api.github.com/repos/${owner}/${repo}/issues/${prData.number}/labels`,
          { labels: ['automated', 'claude'] },
          {
            headers: {
              'Authorization': `token ${process.env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );
      } catch (labelError) {
        console.warn('[ClaudeAutomation] Failed to add labels:', labelError.message);
      }

      return {
        number: prData.number,
        url: prData.html_url,
        branchName,
        branchUrl: `https://github.com/${owner}/${repo}/tree/${branchName}`
      };
    } catch (error) {
      console.error('[ClaudeAutomation] PR creation failed:', error);
      throw new Error(`Failed to create PR: ${error.message}`);
    }
  }

  /**
   * Build analysis prompt for Claude
   */
  buildAnalysisPrompt(issue) {
    return `You are a software engineer analyzing a Linear issue for implementation.

Issue: ${issue.identifier} - ${issue.title}

Description:
${issue.description || 'No description provided'}

Issue Type: ${issue.labels?.map(l => l.name).join(', ') || 'Unknown'}

Your task:
1. Understand what needs to be implemented
2. Identify which files in the codebase need to be modified
3. Propose an implementation approach

Provide a concise analysis (2-3 paragraphs) covering:
- What needs to be done
- Which files should be modified
- Implementation approach

Keep it brief and actionable.`;
  }

  /**
   * Build implementation prompt for Claude
   */
  buildImplementationPrompt(issue, analysis) {
    return `You are implementing the following Linear issue:

Issue: ${issue.identifier} - ${issue.title}
Description: ${issue.description || 'No description provided'}

Analysis:
${analysis.summary}

Your task:
1. Write the necessary code changes
2. Follow existing code patterns in the repository
3. Include tests if applicable
4. Keep changes minimal and focused

Provide the implementation with file paths and code blocks.

Format your response as:
FILE: path/to/file.js
\`\`\`javascript
// code here
\`\`\`

FILE: path/to/test.js
\`\`\`javascript
// test code here
\`\`\`

Keep code clean, simple, and following project conventions.`;
  }

  /**
   * Build PR description
   */
  buildPRDescription(issue, implementation) {
    return `## Summary
Automated implementation of Linear issue ${issue.identifier}

## Issue
${issue.title}

${issue.description || ''}

## Changes
${implementation.summary}

## Linear
${issue.url}

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`;
  }

  /**
   * Helper methods
   */

  createBranchName(issue) {
    const slug = issue.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .substring(0, 50);
    return `automation/linear-${issue.identifier.toLowerCase()}-${slug}`;
  }

  async createBranch(branchName) {
    execSync('git fetch origin main', { encoding: 'utf-8' });
    execSync('git checkout main', { encoding: 'utf-8' });
    execSync('git pull origin main', { encoding: 'utf-8' });
    execSync(`git checkout -b ${branchName}`, { encoding: 'utf-8' });
  }

  async commitChanges(issue, branchName) {
    execSync('git add .', { encoding: 'utf-8' });

    const commitMessage = `[${issue.identifier}] ${issue.title}

Automated implementation

Linear: ${issue.url}

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`;

    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8'
    });
  }

  extractFilesFromAnalysis(text) {
    // Simple extraction of file paths from analysis
    const filePattern = /(\w+\/)+\w+\.\w+/g;
    return text.match(filePattern) || [];
  }

  extractCodeChanges(implementation) {
    const changes = [];
    const filePattern = /FILE:\s*(.+)\n```(\w+)\n([\s\S]+?)```/g;

    let match;
    while ((match = filePattern.exec(implementation)) !== null) {
      changes.push({
        file: match[1].trim(),
        language: match[2],
        code: match[3].trim()
      });
    }

    return changes;
  }

  async applyCodeChanges(changes) {
    for (const change of changes) {
      const filePath = path.join(process.cwd(), change.file);
      const dir = path.dirname(filePath);

      // Create directory if it doesn't exist
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(filePath, change.code, 'utf-8');
      console.log(`[ClaudeAutomation] Written ${change.file}`);
    }
  }

  parseCoverage(output) {
    try {
      // Try to read coverage-summary.json
      const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
      if (fs.existsSync(coveragePath)) {
        const summary = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
        const total = summary.total;
        return Math.round((
          total.lines.pct +
          total.statements.pct +
          total.functions.pct +
          total.branches.pct
        ) / 4);
      }
    } catch (error) {
      console.error('[ClaudeAutomation] Failed to parse coverage:', error);
    }

    return 0;
  }

  getRepoOwner() {
    // Extract from git remote
    const remote = execSync('git config --get remote.origin.url', { encoding: 'utf-8' }).trim();
    const match = remote.match(/github\.com[:/](.+?)\//);
    return match ? match[1] : 'unknown';
  }

  getRepoName() {
    const remote = execSync('git config --get remote.origin.url', { encoding: 'utf-8' }).trim();
    const match = remote.match(/github\.com[:/].+?\/(.+?)(\.git)?$/);
    return match ? match[1].replace('.git', '') : 'unknown';
  }

  getCurrentStep(job) {
    const statusToStep = {
      'pending': 'initialization',
      'analyzing': 'analyze',
      'implementing': 'implement',
      'testing': 'test',
      'pr_created': 'pr_create',
      'merged': 'merge',
      'deployed': 'deploy'
    };
    return statusToStep[job.status] || 'unknown';
  }

  /**
   * Database operations
   */

  async updateJobStatus(jobId, status, errorMessage = null, errorStep = null) {
    const updates = {
      status,
      ...(status === 'analyzing' && { started_at: new Date().toISOString() }),
      ...(status === 'completed' || status === 'failed' || status === 'merged' || status === 'deployed' ? { completed_at: new Date().toISOString() } : {}),
      ...(errorMessage && { error_message: errorMessage }),
      ...(errorStep && { error_step: errorStep })
    };

    const { error } = await this.supabase.supabase
      .from('automation_jobs')
      .update(updates)
      .eq('id', jobId);

    if (error) {
      console.error(`[ClaudeAutomation] Failed to update job ${jobId}:`, error);
    }
  }

  async incrementClaudeCalls(jobId) {
    const { data, error } = await this.supabase.supabase
      .from('automation_jobs')
      .select('claude_calls')
      .eq('id', jobId)
      .single();

    if (!error && data) {
      await this.supabase.supabase
        .from('automation_jobs')
        .update({ claude_calls: (data.claude_calls || 0) + 1 })
        .eq('id', jobId);
    }
  }

  async updateJobBranch(jobId, branchName) {
    await this.supabase.supabase
      .from('automation_jobs')
      .update({ branch_name: branchName })
      .eq('id', jobId);
  }

  async updateJobWithPR(jobId, pr, coverage) {
    await this.supabase.supabase
      .from('automation_jobs')
      .update({
        pr_number: pr.number,
        pr_url: pr.url,
        test_coverage_percent: coverage
      })
      .eq('id', jobId);
  }
}

module.exports = ClaudeAutomationService;
