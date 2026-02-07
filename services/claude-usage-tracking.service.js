/**
 * Claude Usage Tracking Service
 *
 * Manages Claude API usage quotas per user per month
 * - Tracks monthly usage counts
 * - Enforces quota limits (default: 20 analyses/month)
 * - Provides atomic increment operations to prevent race conditions
 * - Supports admin functions for resetting/adjusting limits
 */

const { createClient } = require('@supabase/supabase-js');

class ClaudeUsageTrackingService {
  constructor() {
    // Initialize Supabase with service role key (bypasses RLS for admin operations)
    this.supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Regular client for user operations
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    this.DEFAULT_MONTHLY_LIMIT = 20;
  }

  /**
   * Get current month in YYYY-MM format
   */
  getCurrentMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Calculate reset date (first day of next month)
   */
  getResetDate() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toISOString().split('T')[0];
  }

  /**
   * Check if user has available Claude API quota
   *
   * @param {string} userId - User UUID
   * @returns {Promise<{available: boolean, remaining: number, limit: number, used: number, monthYear: string, resetDate: string}>}
   */
  async checkQuota(userId) {
    try {
      const monthYear = this.getCurrentMonth();

      // Get or create usage record for current month
      let { data, error } = await this.supabaseAdmin
        .from('claude_usage_tracking')
        .select('*')
        .eq('user_id', userId)
        .eq('month_year', monthYear)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found is ok
        throw error;
      }

      // If no record exists, create one with default limit
      if (!data) {
        const { data: newRecord, error: insertError } = await this.supabaseAdmin
          .from('claude_usage_tracking')
          .insert({
            user_id: userId,
            month_year: monthYear,
            usage_count: 0,
            monthly_limit: this.DEFAULT_MONTHLY_LIMIT
          })
          .select()
          .single();

        if (insertError) throw insertError;
        data = newRecord;
      }

      const remaining = Math.max(0, data.monthly_limit - data.usage_count);

      return {
        available: remaining > 0,
        remaining,
        limit: data.monthly_limit,
        used: data.usage_count,
        monthYear,
        resetDate: this.getResetDate()
      };
    } catch (error) {
      console.error('Error checking Claude quota:', error);
      throw new Error(`Failed to check quota: ${error.message}`);
    }
  }

  /**
   * Increment usage count atomically (use after successful Claude API call)
   * Uses PostgreSQL function to ensure atomicity and prevent race conditions
   *
   * @param {string} userId - User UUID
   * @returns {Promise<{success: boolean, usage_count: number, monthly_limit: number, remaining: number}>}
   */
  async incrementUsage(userId) {
    try {
      const monthYear = this.getCurrentMonth();

      // Call PostgreSQL function for atomic increment
      const { data, error } = await this.supabaseAdmin
        .rpc('increment_claude_usage', {
          p_user_id: userId,
          p_month_year: monthYear
        });

      if (error) throw error;

      // The function returns an array with a single row
      const result = data[0];

      return {
        success: true,
        usage_count: result.usage_count,
        monthly_limit: result.monthly_limit,
        remaining: result.remaining
      };
    } catch (error) {
      console.error('Error incrementing Claude usage:', error);
      throw new Error(`Failed to increment usage: ${error.message}`);
    }
  }

  /**
   * Get usage history for a user (multiple months)
   *
   * @param {string} userId - User UUID
   * @param {number} months - Number of months to retrieve (default: 6)
   * @returns {Promise<Array>}
   */
  async getUsageHistory(userId, months = 6) {
    try {
      const { data, error } = await this.supabaseAdmin
        .from('claude_usage_tracking')
        .select('*')
        .eq('user_id', userId)
        .order('month_year', { ascending: false })
        .limit(months);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting usage history:', error);
      throw new Error(`Failed to get usage history: ${error.message}`);
    }
  }

  /**
   * Reset usage count for a specific month (admin function)
   *
   * @param {string} userId - User UUID
   * @param {string} monthYear - Month in YYYY-MM format
   * @returns {Promise<{success: boolean}>}
   */
  async resetUsage(userId, monthYear) {
    try {
      const { error } = await this.supabaseAdmin
        .from('claude_usage_tracking')
        .update({
          usage_count: 0,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('month_year', monthYear);

      if (error) throw error;

      console.log(`✅ Reset usage for user ${userId} in ${monthYear}`);

      return { success: true };
    } catch (error) {
      console.error('Error resetting usage:', error);
      throw new Error(`Failed to reset usage: ${error.message}`);
    }
  }

  /**
   * Update monthly limit for a user (admin function)
   *
   * @param {string} userId - User UUID
   * @param {number} newLimit - New monthly limit
   * @returns {Promise<{success: boolean}>}
   */
  async updateLimit(userId, newLimit) {
    try {
      if (newLimit <= 0) {
        throw new Error('Monthly limit must be greater than 0');
      }

      const monthYear = this.getCurrentMonth();

      // Update or insert with new limit
      const { error } = await this.supabaseAdmin
        .from('claude_usage_tracking')
        .upsert({
          user_id: userId,
          month_year: monthYear,
          monthly_limit: newLimit
        }, {
          onConflict: 'user_id,month_year'
        });

      if (error) throw error;

      console.log(`✅ Updated limit for user ${userId} to ${newLimit}`);

      return { success: true };
    } catch (error) {
      console.error('Error updating limit:', error);
      throw new Error(`Failed to update limit: ${error.message}`);
    }
  }

  /**
   * Get all users who have exceeded their quota (admin function)
   *
   * @returns {Promise<Array>}
   */
  async getUsersOverQuota() {
    try {
      const monthYear = this.getCurrentMonth();

      const { data, error } = await this.supabaseAdmin
        .from('claude_usage_tracking')
        .select('user_id, usage_count, monthly_limit, month_year')
        .eq('month_year', monthYear)
        .filter('usage_count', 'gte', 'monthly_limit');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting users over quota:', error);
      throw new Error(`Failed to get users over quota: ${error.message}`);
    }
  }

  /**
   * Get usage statistics for all users (admin dashboard)
   *
   * @returns {Promise<{totalUsage: number, avgUsage: number, usersOverQuota: number}>}
   */
  async getGlobalStats() {
    try {
      const monthYear = this.getCurrentMonth();

      const { data, error } = await this.supabaseAdmin
        .from('claude_usage_tracking')
        .select('usage_count, monthly_limit')
        .eq('month_year', monthYear);

      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          totalUsage: 0,
          avgUsage: 0,
          usersOverQuota: 0,
          totalUsers: 0
        };
      }

      const totalUsage = data.reduce((sum, row) => sum + row.usage_count, 0);
      const avgUsage = totalUsage / data.length;
      const usersOverQuota = data.filter(row => row.usage_count >= row.monthly_limit).length;

      return {
        totalUsage,
        avgUsage: Math.round(avgUsage * 10) / 10,
        usersOverQuota,
        totalUsers: data.length
      };
    } catch (error) {
      console.error('Error getting global stats:', error);
      throw new Error(`Failed to get global stats: ${error.message}`);
    }
  }
}

// Export singleton instance
module.exports = new ClaudeUsageTrackingService();
