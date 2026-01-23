const { createClient } = require('@supabase/supabase-js');

/**
 * Categorization Service
 * Handles automatic categorization of transactions based on user-defined rules
 */
class CategorizationService {
  constructor() {
    // Use Service Role Key to bypass RLS (same as categories/transactions)
    this.supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  /**
   * Auto-categorize a transaction based on user's rules
   * @param {Object} transaction - Transaction data
   * @param {string} userId - User ID
   * @returns {Promise<string|null>} - Category ID or null
   */
  async autoCategorizeTransaction(transaction, userId) {
    try {
      // Skip if transaction already has a category
      if (transaction.category_id) {
        return transaction.category_id;
      }

      console.log(`[Categorization] Auto-categorizing transaction for user ${userId}`);

      // 1. Get user's categorization rules ordered by priority
      const rules = await this.getCategoryRules(userId);

      if (!rules || rules.length === 0) {
        console.log('[Categorization] No rules found for user');
        return null;
      }

      console.log(`[Categorization] Found ${rules.length} rules to check`);

      // 2. Try to match with each rule (ordered by priority DESC)
      for (const rule of rules) {
        if (this.matchRule(transaction, rule)) {
          console.log(`[Categorization] Matched rule: "${rule.keyword}" → category ${rule.category_id}`);
          return rule.category_id;
        }
      }

      console.log('[Categorization] No matching rule found');
      return null;

    } catch (error) {
      console.error('[Categorization] Error auto-categorizing:', error);
      return null; // Fail gracefully, don't break transaction insertion
    }
  }

  /**
   * Auto-categorize multiple transactions in batch
   * @param {Array<Object>} transactions - Array of transactions
   * @param {string} userId - User ID
   * @returns {Promise<Array<Object>>} - Transactions with category_id filled
   */
  async autoCategorizeTransactions(transactions, userId) {
    try {
      // Get rules once for all transactions
      const rules = await this.getCategoryRules(userId);

      if (!rules || rules.length === 0) {
        return transactions;
      }

      console.log(`[Categorization] Batch categorizing ${transactions.length} transactions with ${rules.length} rules`);

      let categorizedCount = 0;

      // Categorize each transaction
      const categorizedTransactions = transactions.map(transaction => {
        // Skip if already has category
        if (transaction.category_id) {
          return transaction;
        }

        // Try to find matching rule
        for (const rule of rules) {
          if (this.matchRule(transaction, rule)) {
            categorizedCount++;
            return {
              ...transaction,
              category_id: rule.category_id
            };
          }
        }

        return transaction;
      });

      console.log(`[Categorization] Auto-categorized ${categorizedCount}/${transactions.length} transactions`);

      return categorizedTransactions;

    } catch (error) {
      console.error('[Categorization] Error batch categorizing:', error);
      return transactions; // Return unchanged on error
    }
  }

  /**
   * Get user's categorization rules ordered by priority
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Array of rules
   */
  async getCategoryRules(userId) {
    try {
      const { data, error } = await this.supabaseAdmin
        .from('category_rules')
        .select('*')
        .eq('user_id', userId)
        .order('priority', { ascending: false }); // Higher priority first

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('[Categorization] Error fetching rules:', error);
      return [];
    }
  }

  /**
   * Check if a transaction matches a rule
   * @param {Object} transaction - Transaction data
   * @param {Object} rule - Categorization rule
   * @returns {boolean} - True if matches
   */
  matchRule(transaction, rule) {
    // Determine which field(s) to search in
    const searchFields = {
      'description': [transaction.description || ''],
      'merchant': [transaction.merchant || ''],
      'both': [transaction.description || '', transaction.merchant || '']
    };

    const fieldsToSearch = searchFields[rule.match_field] || searchFields['both'];

    // Combine fields into single search text
    const searchText = fieldsToSearch.join(' ');

    // Apply case sensitivity
    const keyword = rule.case_sensitive ? rule.keyword : rule.keyword.toLowerCase();
    const text = rule.case_sensitive ? searchText : searchText.toLowerCase();

    // Check for match
    if (rule.is_regex) {
      try {
        const regex = new RegExp(keyword, rule.case_sensitive ? '' : 'i');
        return regex.test(searchText);
      } catch (e) {
        console.error(`[Categorization] Invalid regex: ${keyword}`, e);
        return false;
      }
    } else {
      // Simple substring match (supports wildcards via includes)
      // Convert SQL-style wildcards (%) to JS-friendly format
      if (keyword.includes('%')) {
        // Convert % to .* for regex
        const regexPattern = keyword.replace(/%/g, '.*');
        try {
          const regex = new RegExp(regexPattern, rule.case_sensitive ? '' : 'i');
          return regex.test(searchText);
        } catch (e) {
          return false;
        }
      }

      return text.includes(keyword);
    }
  }

  /**
   * Add a new categorization rule
   * @param {Object} ruleData - Rule data
   * @returns {Promise<Object>} - Created rule
   */
  async addCategoryRule(ruleData) {
    try {
      const { data, error } = await this.supabaseAdmin
        .from('category_rules')
        .insert(ruleData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log(`[Categorization] Created rule: ${ruleData.keyword} → category ${ruleData.category_id}`);

      return data;
    } catch (error) {
      console.error('[Categorization] Error adding rule:', error);
      throw new Error(`Failed to add category rule: ${error.message}`);
    }
  }

  /**
   * Delete a categorization rule
   * @param {string} ruleId - Rule ID
   * @param {string} userId - User ID (for security)
   * @returns {Promise<boolean>} - Success
   */
  async deleteCategoryRule(ruleId, userId) {
    try {
      const { error } = await this.supabaseAdmin
        .from('category_rules')
        .delete()
        .eq('id', ruleId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      console.log(`[Categorization] Deleted rule ${ruleId}`);

      return true;
    } catch (error) {
      console.error('[Categorization] Error deleting rule:', error);
      throw new Error(`Failed to delete category rule: ${error.message}`);
    }
  }

  /**
   * Get all rules for a specific category
   * @param {string} categoryId - Category ID
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Array of rules
   */
  async getRulesByCategory(categoryId, userId) {
    try {
      const { data, error } = await this.supabaseAdmin
        .from('category_rules')
        .select('*')
        .eq('category_id', categoryId)
        .eq('user_id', userId)
        .order('priority', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('[Categorization] Error fetching category rules:', error);
      return [];
    }
  }
}

module.exports = new CategorizationService();
