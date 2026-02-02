const axios = require('axios');

/**
 * Linear API Service
 * Handles all interactions with Linear's GraphQL API
 */
class LinearService {
  constructor() {
    this.apiKey = process.env.LINEAR_API_KEY;
    this.apiUrl = 'https://api.linear.app/graphql';

    if (!this.apiKey) {
      console.warn('[Linear] API key not configured. Linear integration will not work.');
    }
  }

  /**
   * Make a GraphQL request to Linear API
   * @param {string} query - GraphQL query
   * @param {Object} variables - Query variables
   * @returns {Promise<Object>} Response data
   */
  async request(query, variables = {}) {
    if (!this.apiKey) {
      throw new Error('Linear API key not configured');
    }

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          query,
          variables
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': this.apiKey
          }
        }
      );

      if (response.data.errors) {
        throw new Error(`Linear API errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data;
    } catch (error) {
      console.error('[Linear] API request failed:', error.message);
      throw error;
    }
  }

  /**
   * Fetch issue details by ID
   * @param {string} issueId - Linear issue ID (e.g., "MAN-123")
   * @returns {Promise<Object>} Issue data
   */
  async getIssue(issueId) {
    const query = `
      query GetIssue($issueId: String!) {
        issue(id: $issueId) {
          id
          identifier
          title
          description
          url
          state {
            id
            name
            type
          }
          assignee {
            id
            name
            email
          }
          labels {
            nodes {
              id
              name
            }
          }
          team {
            id
            name
            key
          }
          createdAt
          updatedAt
        }
      }
    `;

    try {
      const data = await this.request(query, { issueId });
      return data.issue;
    } catch (error) {
      console.error(`[Linear] Failed to fetch issue ${issueId}:`, error.message);
      throw error;
    }
  }

  /**
   * Update issue status
   * @param {string} issueId - Linear issue ID
   * @param {string} stateId - New state ID
   * @returns {Promise<boolean>} Success status
   */
  async updateIssueState(issueId, stateId) {
    const query = `
      mutation UpdateIssue($issueId: String!, $stateId: String!) {
        issueUpdate(
          id: $issueId,
          input: { stateId: $stateId }
        ) {
          success
          issue {
            id
            state {
              name
            }
          }
        }
      }
    `;

    try {
      const data = await this.request(query, { issueId, stateId });
      console.log(`[Linear] Updated issue ${issueId} to state ${stateId}`);
      return data.issueUpdate.success;
    } catch (error) {
      console.error(`[Linear] Failed to update issue ${issueId}:`, error.message);
      throw error;
    }
  }

  /**
   * Post a comment on an issue
   * @param {string} issueId - Linear issue ID
   * @param {string} body - Comment body (supports markdown)
   * @returns {Promise<Object>} Created comment
   */
  async createComment(issueId, body) {
    const query = `
      mutation CreateComment($issueId: String!, $body: String!) {
        commentCreate(
          input: {
            issueId: $issueId,
            body: $body
          }
        ) {
          success
          comment {
            id
            body
            createdAt
          }
        }
      }
    `;

    try {
      const data = await this.request(query, { issueId, body });
      console.log(`[Linear] Posted comment on issue ${issueId}`);
      return data.commentCreate.comment;
    } catch (error) {
      console.error(`[Linear] Failed to post comment on ${issueId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get workflow states for a team
   * @param {string} teamId - Team ID
   * @returns {Promise<Array>} List of workflow states
   */
  async getWorkflowStates(teamId) {
    const query = `
      query GetWorkflowStates($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              name
              type
              position
            }
          }
        }
      }
    `;

    try {
      const data = await this.request(query, { teamId });
      return data.team.states.nodes;
    } catch (error) {
      console.error(`[Linear] Failed to fetch workflow states for team ${teamId}:`, error.message);
      throw error;
    }
  }

  /**
   * Find state ID by name (case-insensitive)
   * @param {string} teamId - Team ID
   * @param {string} stateName - State name (e.g., "In Progress", "Done")
   * @returns {Promise<string|null>} State ID or null if not found
   */
  async findStateIdByName(teamId, stateName) {
    try {
      const states = await this.getWorkflowStates(teamId);
      const state = states.find(
        s => s.name.toLowerCase() === stateName.toLowerCase()
      );
      return state ? state.id : null;
    } catch (error) {
      console.error(`[Linear] Failed to find state "${stateName}":`, error.message);
      return null;
    }
  }

  /**
   * Attach a URL/link to an issue
   * @param {string} issueId - Linear issue ID
   * @param {string} url - URL to attach
   * @param {string} title - Link title
   * @returns {Promise<Object>} Created attachment
   */
  async createAttachment(issueId, url, title) {
    const query = `
      mutation CreateAttachment($issueId: String!, $url: String!, $title: String!) {
        attachmentCreate(
          input: {
            issueId: $issueId,
            url: $url,
            title: $title
          }
        ) {
          success
          attachment {
            id
            url
            title
          }
        }
      }
    `;

    try {
      const data = await this.request(query, { issueId, url, title });
      console.log(`[Linear] Attached ${title} to issue ${issueId}`);
      return data.attachmentCreate.attachment;
    } catch (error) {
      console.error(`[Linear] Failed to create attachment on ${issueId}:`, error.message);
      throw error;
    }
  }

  /**
   * Helper: Post automation progress update
   * @param {string} issueId - Linear issue ID
   * @param {string} status - Status emoji/text
   * @param {string} message - Progress message
   * @param {Object} details - Additional details
   */
  async postAutomationUpdate(issueId, status, message, details = {}) {
    const body = this.formatAutomationComment(status, message, details);
    return await this.createComment(issueId, body);
  }

  /**
   * Format automation comment
   * @param {string} status - Status (emoji or text)
   * @param {string} message - Main message
   * @param {Object} details - Additional details
   * @returns {string} Formatted markdown comment
   */
  formatAutomationComment(status, message, details = {}) {
    let comment = `🤖 **Automation Update**\n\n${status} **Status**: ${message}\n`;

    if (details.step) {
      comment += `\n**Step**: ${details.step}\n`;
    }

    if (details.error) {
      comment += `\n**Error**: \`${details.error}\`\n`;
    }

    if (details.details) {
      comment += `\n**Details**: ${details.details}\n`;
    }

    if (details.nextSteps && details.nextSteps.length > 0) {
      comment += '\n**Next Steps**:\n';
      details.nextSteps.forEach(step => {
        comment += `- ${step}\n`;
      });
    }

    if (details.links) {
      comment += '\n**Links**:\n';
      Object.entries(details.links).forEach(([key, url]) => {
        comment += `- [${key}](${url})\n`;
      });
    }

    comment += `\n_Generated at ${new Date().toISOString()}_`;

    return comment;
  }
}

module.exports = LinearService;
