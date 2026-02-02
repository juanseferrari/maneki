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

    const branchName = this.createBranchName(issue);

    try {
      // Step 1: Get existing file contents for files that need to be modified
      const filesToModify = analysis.filesNeeded && analysis.filesNeeded.length > 0
        ? analysis.filesNeeded
        : ['server-supabase.js']; // Default if analysis didn't find any

      console.log(`[ClaudeAutomation] Files to modify: ${filesToModify.join(', ')}`);

      const fileContents = await this.fetchFilesFromGitHub(filesToModify);

      // Step 2: Ask Claude to generate the updated code
      const prompt = this.buildImplementationPrompt(issue, analysis, fileContents);

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
      console.log(`[ClaudeAutomation] Implementation response length: ${implementation.length} chars`);

      // Extract code changes
      const changes = this.extractCodeChanges(implementation);
      console.log(`[ClaudeAutomation] Extracted ${changes.length} file changes`);

      if (changes.length === 0) {
        throw new Error('No code changes extracted from Claude response. Response may not be in expected format.');
      }

      // Create branch and commit changes using GitHub API
      await this.createBranchAndCommit(branchName, changes, issue);

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
      const owner = this.getRepoOwner();
      const repo = this.getRepoName();

      // Create PR using GitHub API
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
  buildImplementationPrompt(issue, analysis, fileContents) {
    let filesContext = '';

    if (fileContents && Object.keys(fileContents).length > 0) {
      filesContext = '\n## Existing Files\n\n';
      for (const [filePath, content] of Object.entries(fileContents)) {
        filesContext += `### ${filePath}\n\`\`\`javascript\n${content}\n\`\`\`\n\n`;
      }
    }

    return `You are implementing code for the following Linear issue:

Issue: ${issue.identifier} - ${issue.title}
Description: ${issue.description || 'No description provided'}

Analysis:
${analysis.summary}
${filesContext}
CRITICAL INSTRUCTIONS:
1. You MUST provide actual code implementation
2. You MUST use EXACTLY this format for each file:

FILE: path/to/file.js
\`\`\`javascript
// Complete file code here
\`\`\`

3. Provide the COMPLETE file content, not just snippets
4. For each file you need to modify, provide the full updated version
5. Do NOT provide explanations or analysis - ONLY provide code in the format above
6. Make minimal changes - only add what's needed for this specific issue

Example output format:
FILE: server-supabase.js
\`\`\`javascript
const express = require('express');
// ... rest of the complete file content with your changes
\`\`\`

Now provide the complete implementation:`;
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

  /**
   * Create branch and commit changes using GitHub API
   */
  async createBranchAndCommit(branchName, changes, issue) {
    const owner = this.getRepoOwner();
    const repo = this.getRepoName();

    try {
      // 1. Get the latest commit SHA from main branch
      const refResponse = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/main`,
        {
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      const mainSha = refResponse.data.object.sha;
      console.log(`[ClaudeAutomation] Main branch SHA: ${mainSha}`);

      // 2. Create a new branch from main
      await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/git/refs`,
        {
          ref: `refs/heads/${branchName}`,
          sha: mainSha
        },
        {
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      console.log(`[ClaudeAutomation] Created branch: ${branchName}`);

      // 3. Get the base tree
      const commitResponse = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/git/commits/${mainSha}`,
        {
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      const baseTreeSha = commitResponse.data.tree.sha;

      // 4. Create blobs for each file
      const treeItems = [];
      for (const change of changes) {
        const blobResponse = await axios.post(
          `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
          {
            content: change.code,
            encoding: 'utf-8'
          },
          {
            headers: {
              'Authorization': `token ${process.env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );

        treeItems.push({
          path: change.file,
          mode: '100644',
          type: 'blob',
          sha: blobResponse.data.sha
        });

        console.log(`[ClaudeAutomation] Created blob for ${change.file}`);
      }

      // 5. Create a new tree
      const treeResponse = await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/git/trees`,
        {
          base_tree: baseTreeSha,
          tree: treeItems
        },
        {
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      const newTreeSha = treeResponse.data.sha;
      console.log(`[ClaudeAutomation] Created tree: ${newTreeSha}`);

      // 6. Create a commit
      const commitMessage = `[${issue.identifier}] ${issue.title}

Automated implementation

Linear: ${issue.url}

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`;

      const newCommitResponse = await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/git/commits`,
        {
          message: commitMessage,
          tree: newTreeSha,
          parents: [mainSha]
        },
        {
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      const newCommitSha = newCommitResponse.data.sha;
      console.log(`[ClaudeAutomation] Created commit: ${newCommitSha}`);

      // 7. Update the branch reference to point to the new commit
      await axios.patch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branchName}`,
        {
          sha: newCommitSha,
          force: false
        },
        {
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      console.log(`[ClaudeAutomation] Updated branch ${branchName} to ${newCommitSha}`);

    } catch (error) {
      console.error('[ClaudeAutomation] Branch creation failed:', error.response?.data || error.message);
      throw new Error(`Failed to create branch and commit: ${error.response?.data?.message || error.message}`);
    }
  }

  extractFilesFromAnalysis(text) {
    // Simple extraction of file paths from analysis
    const filePattern = /(\w+\/)+\w+\.\w+/g;
    return text.match(filePattern) || [];
  }

  /**
   * Fetch file contents from GitHub
   */
  async fetchFilesFromGitHub(filePaths) {
    const owner = this.getRepoOwner();
    const repo = this.getRepoName();
    const fileContents = {};

    for (const filePath of filePaths) {
      try {
        const response = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
          {
            headers: {
              'Authorization': `token ${process.env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );

        // Decode base64 content
        const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
        fileContents[filePath] = content;
        console.log(`[ClaudeAutomation] Fetched ${filePath} (${content.length} bytes)`);
      } catch (error) {
        console.warn(`[ClaudeAutomation] Could not fetch ${filePath}:`, error.message);
        // If file doesn't exist, it's okay - Claude will create it
      }
    }

    return fileContents;
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
    // Use environment variable or default
    return process.env.GITHUB_REPO_OWNER || 'juanseferrari';
  }

  getRepoName() {
    // Use environment variable or default
    return process.env.GITHUB_REPO_NAME || 'maneki';
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
