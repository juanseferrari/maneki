const crypto = require('crypto');

/**
 * Linear Webhook Service
 * Handles Linear webhook events and triggers automation
 */
class LinearWebhookService {
  constructor(supabaseService, claudeAutomationService) {
    this.supabase = supabaseService;
    this.claudeAutomation = claudeAutomationService;
    this.webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;

    if (!this.webhookSecret) {
      console.warn('[LinearWebhook] Webhook secret not configured. Signature verification will be skipped.');
    }
  }

  /**
   * Verify webhook signature
   * @param {string} payload - Raw request body
   * @param {string} signature - Signature from Linear-Signature header
   * @returns {boolean} Is signature valid
   */
  verifySignature(payload, signature) {
    if (!this.webhookSecret) {
      console.warn('[LinearWebhook] Skipping signature verification (no secret configured)');
      return true; // Skip verification in development
    }

    try {
      const hmac = crypto.createHmac('sha256', this.webhookSecret);
      hmac.update(payload);
      const expectedSignature = hmac.digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('[LinearWebhook] Signature verification error:', error);
      return false;
    }
  }

  /**
   * Process incoming webhook event
   * @param {Object} event - Webhook event payload
   * @returns {Promise<Object>} Processing result
   */
  async processWebhook(event) {
    try {
      console.log('[LinearWebhook] Processing webhook event:', event.type);

      const { type, action, data } = event;

      // Only process issue events
      if (type !== 'Issue') {
        console.log(`[LinearWebhook] Ignoring non-issue event: ${type}`);
        return { success: true, message: 'Ignored non-issue event' };
      }

      // Extract issue data
      const issue = data;

      // Check if this is an automation-eligible event
      if (!this.shouldTriggerAutomation(action, issue)) {
        console.log(`[LinearWebhook] Event does not trigger automation: ${action}`);
        return { success: true, message: 'Event does not trigger automation' };
      }

      // Check if issue has the automation label
      const hasAutoLabel = this.hasAutomationLabel(issue);
      if (!hasAutoLabel) {
        console.log(`[LinearWebhook] Issue ${issue.identifier} does not have automation label`);
        return { success: true, message: 'Issue does not have automation label' };
      }

      // Check if already processing this issue
      const existingJob = await this.findExistingJob(issue.id);
      if (existingJob && existingJob.status !== 'failed') {
        console.log(`[LinearWebhook] Issue ${issue.identifier} already has active job`);
        return { success: true, message: 'Issue already being processed' };
      }

      // Create automation job
      const job = await this.createAutomationJob(issue);
      console.log(`[LinearWebhook] Created automation job ${job.id} for issue ${issue.identifier}`);

      // Trigger automation asynchronously (don't wait for completion)
      this.triggerAutomation(job, issue).catch(error => {
        console.error(`[LinearWebhook] Automation failed for job ${job.id}:`, error);
      });

      return {
        success: true,
        message: 'Automation triggered',
        jobId: job.id
      };
    } catch (error) {
      console.error('[LinearWebhook] Error processing webhook:', error);
      throw error;
    }
  }

  /**
   * Check if event should trigger automation
   * @param {string} action - Webhook action (create, update)
   * @param {Object} issue - Issue data
   * @returns {boolean} Should trigger automation
   */
  shouldTriggerAutomation(action, issue) {
    // Trigger on issue creation or when status changes to "Todo"
    if (action === 'create') {
      return true;
    }

    if (action === 'update') {
      // Check if status changed to "Todo" or "Backlog"
      const stateName = issue.state?.name?.toLowerCase() || '';
      return stateName === 'todo' || stateName === 'backlog';
    }

    return false;
  }

  /**
   * Check if issue has automation label
   * @param {Object} issue - Issue data
   * @returns {boolean} Has automation label
   */
  hasAutomationLabel(issue) {
    const labels = issue.labels || [];
    const automationLabels = ['claude-auto', 'automate', 'automation'];

    return labels.some(label =>
      automationLabels.includes(label.name?.toLowerCase())
    );
  }

  /**
   * Find existing automation job for issue
   * @param {string} linearIssueId - Linear issue ID
   * @returns {Promise<Object|null>} Existing job or null
   */
  async findExistingJob(linearIssueId) {
    try {
      const { data, error } = await this.supabase.supabase
        .from('automation_jobs')
        .select('*')
        .eq('linear_issue_id', linearIssueId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[LinearWebhook] Error finding existing job:', error);
      return null;
    }
  }

  /**
   * Create automation job record in database
   * @param {Object} issue - Linear issue data
   * @returns {Promise<Object>} Created job
   */
  async createAutomationJob(issue) {
    try {
      const jobData = {
        linear_issue_id: issue.id,
        linear_issue_url: issue.url,
        issue_title: issue.title,
        issue_description: issue.description || '',
        issue_type: this.detectIssueType(issue),
        status: 'pending',
        metadata: {
          team: issue.team,
          labels: issue.labels,
          assignee: issue.assignee,
          state: issue.state
        }
      };

      const { data, error } = await this.supabase.supabase
        .from('automation_jobs')
        .insert(jobData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[LinearWebhook] Error creating automation job:', error);
      throw error;
    }
  }

  /**
   * Detect issue type from labels
   * @param {Object} issue - Issue data
   * @returns {string} Issue type (feature, bug, refactor, other)
   */
  detectIssueType(issue) {
    const labels = (issue.labels || []).map(l => l.name?.toLowerCase());

    if (labels.some(l => l.includes('feature') || l.includes('enhancement'))) {
      return 'feature';
    }
    if (labels.some(l => l.includes('bug') || l.includes('fix'))) {
      return 'bug';
    }
    if (labels.some(l => l.includes('refactor') || l.includes('tech-debt'))) {
      return 'refactor';
    }

    // Default to feature
    return 'feature';
  }

  /**
   * Trigger automation for a job
   * @param {Object} job - Automation job record
   * @param {Object} issue - Linear issue data
   */
  async triggerAutomation(job, issue) {
    try {
      console.log(`[LinearWebhook] Starting automation for job ${job.id}`);

      // Update job status to analyzing
      await this.updateJobStatus(job.id, 'analyzing');

      // Call Claude automation service
      await this.claudeAutomation.processIssue(job, issue);

      console.log(`[LinearWebhook] Automation completed for job ${job.id}`);
    } catch (error) {
      console.error(`[LinearWebhook] Automation error for job ${job.id}:`, error);

      // Update job status to failed
      await this.updateJobStatus(job.id, 'failed', error.message);

      // Notify in Linear issue
      if (this.claudeAutomation.linearService) {
        await this.claudeAutomation.linearService.postAutomationUpdate(
          issue.id,
          '❌',
          'Failed to start automation',
          {
            error: error.message,
            nextSteps: [
              'Check automation service logs',
              'Verify Claude API key is configured',
              'Try re-running with the automation label'
            ]
          }
        );
      }
    }
  }

  /**
   * Update automation job status
   * @param {string} jobId - Job ID
   * @param {string} status - New status
   * @param {string} errorMessage - Optional error message
   */
  async updateJobStatus(jobId, status, errorMessage = null) {
    try {
      const updates = {
        status,
        ...(status === 'analyzing' && { started_at: new Date().toISOString() }),
        ...(status === 'completed' || status === 'failed' ? { completed_at: new Date().toISOString() } : {}),
        ...(errorMessage && { error_message: errorMessage })
      };

      const { error } = await this.supabase.supabase
        .from('automation_jobs')
        .update(updates)
        .eq('id', jobId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error(`[LinearWebhook] Error updating job ${jobId}:`, error);
    }
  }
}

module.exports = LinearWebhookService;
