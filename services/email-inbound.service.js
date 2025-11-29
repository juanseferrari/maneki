const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

/**
 * Email Inbound Service
 * Handles incoming emails with file attachments from Google Apps Script
 */
class EmailInboundService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
  }

  /**
   * Generate a unique email token for a user
   * Format: 8 character alphanumeric token
   */
  generateEmailToken() {
    return crypto.randomBytes(4).toString('hex').toLowerCase();
  }

  /**
   * Get or create email token for a user
   * @param {string} userId - Supabase user ID
   * @returns {Promise<string>} Email token
   */
  async getOrCreateEmailToken(userId) {
    // First, try to get existing token
    const { data: existingUser, error: fetchError } = await this.supabase
      .from('user_settings')
      .select('email_upload_token')
      .eq('user_id', userId)
      .single();

    if (existingUser?.email_upload_token) {
      return existingUser.email_upload_token;
    }

    // Generate new token
    const token = this.generateEmailToken();

    // Upsert user settings with new token
    const { error: upsertError } = await this.supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        email_upload_token: token,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (upsertError) {
      console.error('Error creating email token:', upsertError);
      throw new Error('Failed to create email token');
    }

    return token;
  }

  /**
   * Get user ID from email token
   * @param {string} token - Email upload token
   * @returns {Promise<string|null>} User ID or null if not found
   */
  async getUserIdFromToken(token) {
    const { data, error } = await this.supabase
      .from('user_settings')
      .select('user_id')
      .eq('email_upload_token', token)
      .single();

    if (error || !data) {
      return null;
    }

    return data.user_id;
  }

  /**
   * Regenerate email token for a user
   * @param {string} userId - Supabase user ID
   * @returns {Promise<string>} New email token
   */
  async regenerateEmailToken(userId) {
    const token = this.generateEmailToken();

    const { error } = await this.supabase
      .from('user_settings')
      .update({
        email_upload_token: token,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error regenerating email token:', error);
      throw new Error('Failed to regenerate email token');
    }

    return token;
  }

  /**
   * Log an inbound email event
   * @param {Object} emailData - Email metadata
   */
  async logEmailEvent(emailData) {
    try {
      await this.supabase
        .from('email_inbound_logs')
        .insert({
          user_id: emailData.userId,
          from_email: emailData.fromEmail,
          subject: emailData.subject,
          attachment_count: emailData.attachmentCount,
          processed_files: emailData.processedFiles || [],
          status: emailData.status,
          error_message: emailData.errorMessage || null,
          raw_data: emailData.rawData || null
        });
    } catch (error) {
      console.error('Error logging email event:', error);
      // Don't throw - logging should not break the flow
    }
  }

  /**
   * Verify webhook secret
   * @param {string} secret - Secret from request
   * @returns {boolean}
   */
  verifyWebhookSecret(secret) {
    const expectedSecret = process.env.EMAIL_WEBHOOK_SECRET;
    if (!expectedSecret) {
      console.warn('EMAIL_WEBHOOK_SECRET not configured');
      return false;
    }
    return secret === expectedSecret;
  }

  /**
   * Parse email address to extract token
   * Supports formats:
   * - admin+abc123@sheetscentral.com -> abc123
   * - abc123@inbox.maneki.app -> abc123
   */
  parseEmailToken(toEmail) {
    // Format: user+token@domain.com
    const plusMatch = toEmail.match(/\+([a-z0-9]+)@/i);
    if (plusMatch) {
      return plusMatch[1].toLowerCase();
    }

    // Format: token@subdomain.domain.com
    const subdomainMatch = toEmail.match(/^([a-z0-9]+)@/i);
    if (subdomainMatch) {
      return subdomainMatch[1].toLowerCase();
    }

    return null;
  }

  /**
   * Get supported file extensions
   */
  getSupportedExtensions() {
    return ['.pdf', '.csv', '.xlsx', '.xls', '.png', '.jpg', '.jpeg'];
  }

  /**
   * Check if file is supported
   * @param {string} filename
   */
  isFileSupported(filename) {
    const ext = filename.toLowerCase().match(/\.[^.]+$/);
    if (!ext) return false;
    return this.getSupportedExtensions().includes(ext[0]);
  }

  /**
   * Get MIME type from filename
   * @param {string} filename
   */
  getMimeType(filename) {
    const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.csv': 'text/csv',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

module.exports = new EmailInboundService();
