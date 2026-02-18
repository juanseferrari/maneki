const { createClient } = require('@supabase/supabase-js');
const mercuryOAuth = require('../oauth/mercury-oauth.service');

/**
 * Mercury Sync Service
 * Fetches transactions from Mercury Bank API
 *
 * Mercury API Documentation: https://docs.mercury.com/reference
 */
class MercurySyncService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
  }

  /**
   * Get the date of the last synced transaction for incremental sync
   * @param {string} userId - User ID
   * @returns {Promise<Date|null>} Last transaction date or null
   */
  async getLastSyncedDate(userId) {
    try {
      const { data, error } = await this.supabase
        .from('transactions')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('source', 'mercury')
        .order('transaction_date', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      // Use postedAt or createdAt from raw_data for more precision
      const lastDate = data.raw_data?.postedAt || data.raw_data?.createdAt;
      if (lastDate) {
        return new Date(lastDate);
      }

      return null;
    } catch (error) {
      console.log('[Mercury Sync] No previous transactions found, will do full sync');
      return null;
    }
  }

  /**
   * Sync all transactions from Mercury for a user
   * @param {string} userId - User ID
   * @param {string} accessToken - Mercury access token
   * @param {string} connectionId - Connection ID
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} Sync result
   */
  async syncTransactions(userId, accessToken, connectionId, options = {}) {
    // Get the last synced date for incremental sync
    const lastSyncedDate = await this.getLastSyncedDate(userId);

    // If we have a last synced date, start from there
    // Otherwise, use the default (3 months ago) or provided fromDate
    let effectiveFromDate;
    if (lastSyncedDate && !options.fromDate) {
      // Add 1 second to last synced date to avoid re-fetching the same transaction
      effectiveFromDate = new Date(lastSyncedDate.getTime() + 1000);
      console.log(`[Mercury Sync] Incremental sync from last transaction: ${effectiveFromDate.toISOString()}`);
    } else {
      effectiveFromDate = options.fromDate || this.getDefaultFromDate();
      console.log(`[Mercury Sync] Full sync from: ${effectiveFromDate.toISOString()}`);
    }

    const {
      toDate = new Date()
    } = options;

    const fromDate = effectiveFromDate;

    console.log(`[Mercury Sync] Starting sync for user ${userId}`);
    console.log(`[Mercury Sync] Date range: ${fromDate.toISOString()} to ${toDate.toISOString()}`);

    try {
      // Get all accounts
      const accounts = await mercuryOAuth.getAccounts(accessToken);
      console.log(`[Mercury Sync] Found ${accounts.length} accounts`);

      if (accounts.length === 0) {
        return {
          success: true,
          syncedCount: 0,
          skippedCount: 0,
          message: 'No accounts found'
        };
      }

      let totalSynced = 0;
      let totalSkipped = 0;

      // Sync transactions for each account
      for (const account of accounts) {
        console.log(`[Mercury Sync] Syncing account: ${account.name} (${account.id})`);

        const { syncedCount, skippedCount } = await this.syncAccountTransactions(
          userId,
          accessToken,
          connectionId,
          account,
          fromDate,
          toDate
        );

        totalSynced += syncedCount;
        totalSkipped += skippedCount;
      }

      console.log(`[Mercury Sync] Sync complete: ${totalSynced} new, ${totalSkipped} skipped`);

      return {
        success: true,
        syncedCount: totalSynced,
        skippedCount: totalSkipped,
        accountsProcessed: accounts.length
      };
    } catch (error) {
      console.error('[Mercury Sync] Sync error:', error);
      throw error;
    }
  }

  /**
   * Sync transactions for a single account
   * @param {string} userId - User ID
   * @param {string} accessToken - Access token
   * @param {string} connectionId - Connection ID
   * @param {Object} account - Account object
   * @param {Date} fromDate - Start date
   * @param {Date} toDate - End date
   * @returns {Promise<Object>} Sync result
   */
  async syncAccountTransactions(userId, accessToken, connectionId, account, fromDate, toDate) {
    try {
      // Fetch all transactions with pagination
      const allTransactions = await this.fetchAllTransactions(
        accessToken,
        account.id,
        fromDate,
        toDate
      );

      console.log(`[Mercury Sync] Fetched ${allTransactions.length} transactions for account ${account.name}`);

      if (allTransactions.length === 0) {
        return { syncedCount: 0, skippedCount: 0 };
      }

      // Transform transactions
      const transactions = allTransactions.map(tx =>
        this.transformTransaction(tx, userId, connectionId, account)
      );

      // Save transactions (with deduplication)
      const { syncedCount, skippedCount } = await this.saveTransactions(transactions, userId);

      return { syncedCount, skippedCount };
    } catch (error) {
      console.error(`[Mercury Sync] Error syncing account ${account.id}:`, error);
      throw error;
    }
  }

  /**
   * Fetch all transactions with pagination
   * @param {string} accessToken - Access token
   * @param {string} accountId - Account ID
   * @param {Date} fromDate - Start date
   * @param {Date} toDate - End date
   * @returns {Promise<Array>} All transactions
   */
  async fetchAllTransactions(accessToken, accountId, fromDate, toDate) {
    const allTransactions = [];
    let offset = 0;
    const limit = 500;
    let hasMore = true;

    // Format dates for Mercury API (YYYY-MM-DD)
    const start = fromDate.toISOString().split('T')[0];
    const end = toDate.toISOString().split('T')[0];

    while (hasMore) {
      const transactions = await mercuryOAuth.getTransactions(accessToken, accountId, {
        start,
        end,
        limit,
        offset
      });

      if (transactions.length > 0) {
        allTransactions.push(...transactions);
        offset += transactions.length;

        // If we got fewer than the limit, we've reached the end
        hasMore = transactions.length === limit;

        console.log(`[Mercury Sync] Fetched ${allTransactions.length} transactions so far`);
      } else {
        hasMore = false;
      }

      // Rate limiting: wait 100ms between requests
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return allTransactions;
  }

  /**
   * Transform a Mercury transaction to our transaction format
   * @param {Object} tx - Mercury transaction object
   * @param {string} userId - User ID
   * @param {string} connectionId - Connection ID
   * @param {Object} account - Account object
   * @returns {Object} Transaction object
   */
  transformTransaction(tx, userId, connectionId, account) {
    // Mercury amounts: positive = credit, negative = debit
    const amount = tx.amount;
    const isCredit = amount > 0;

    // Parse the date with full timestamp
    const transactionDate = tx.postedAt || tx.createdAt;
    const dateOnly = new Date(transactionDate).toISOString().split('T')[0];
    const dateTime = new Date(transactionDate).toISOString(); // Full ISO timestamp

    // Build description
    let description = tx.bankDescription || tx.externalMemo || '';
    if (tx.note) {
      description = description ? `${description} - ${tx.note}` : tx.note;
    }
    if (!description) {
      description = tx.kind || 'Transaction';
    }

    // Get counterparty info
    const counterparty = tx.counterpartyName || tx.counterpartyNickname || null;

    return {
      user_id: userId,
      connection_id: connectionId,
      source: 'mercury',
      provider_transaction_id: tx.id,

      transaction_date: dateOnly, // Keep for backwards compatibility
      transaction_datetime: dateTime, // New field with full timestamp
      description: description,
      merchant: counterparty,
      amount: amount,
      transaction_type: isCredit ? 'credit' : 'debit',
      currency: 'USD',

      status: tx.status || 'completed',
      payment_method: tx.kind, // 'externalTransfer', 'internalTransfer', 'outgoingPayment', etc.
      operation_type: tx.kind,

      counterparty_id: tx.counterpartyId || null,
      counterparty_name: counterparty,
      counterparty_email: null, // Mercury doesn't provide email

      external_reference: tx.externalMemo || null,
      reference_number: tx.id,

      account_id: account.id,
      account_name: account.name,

      bank_name: 'Mercury',
      balance: tx.runningBalance || null,

      raw_data: {
        id: tx.id,
        kind: tx.kind,
        status: tx.status,
        amount: tx.amount,
        postedAt: tx.postedAt,
        createdAt: tx.createdAt,
        bankDescription: tx.bankDescription,
        externalMemo: tx.externalMemo,
        note: tx.note,
        counterpartyId: tx.counterpartyId,
        counterpartyName: tx.counterpartyName,
        counterpartyNickname: tx.counterpartyNickname,
        runningBalance: tx.runningBalance,
        account: {
          id: account.id,
          name: account.name,
          type: account.type
        }
      },

      confidence_score: 100 // Direct API integration = 100% confidence
    };
  }

  /**
   * Save transactions to database with deduplication
   * @param {Array} transactions - Transactions to save
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Result with counts
   */
  async saveTransactions(transactions, userId) {
    let syncedCount = 0;
    let skippedCount = 0;

    for (const transaction of transactions) {
      try {
        // Check if transaction already exists (deduplication)
        const { data: existing } = await this.supabase
          .from('transactions')
          .select('id')
          .eq('user_id', userId)
          .eq('source', 'mercury')
          .eq('provider_transaction_id', transaction.provider_transaction_id)
          .single();

        if (existing) {
          skippedCount++;
          continue;
        }

        // Insert new transaction
        const { error } = await this.supabase
          .from('transactions')
          .insert(transaction);

        if (error) {
          console.error('[Mercury Sync] Insert error:', error);
          continue;
        }

        syncedCount++;
      } catch (error) {
        // PGRST116 means no rows found (expected for new transactions)
        if (error.code !== 'PGRST116') {
          console.error('[Mercury Sync] Transaction save error:', error);
        }

        // Try to insert if the select failed (not a duplicate check error)
        try {
          const { error: insertError } = await this.supabase
            .from('transactions')
            .insert(transaction);

          if (!insertError) {
            syncedCount++;
          } else if (insertError.code === '23505') {
            // Unique constraint violation = duplicate
            skippedCount++;
          }
        } catch (e) {
          console.error('[Mercury Sync] Insert retry error:', e);
        }
      }
    }

    return { syncedCount, skippedCount };
  }

  /**
   * Get default from date (3 months ago)
   * @returns {Date}
   */
  getDefaultFromDate() {
    const date = new Date();
    date.setMonth(date.getMonth() - 3);
    return date;
  }

  /**
   * Get account balances
   * @param {string} accessToken - Access token
   * @returns {Promise<Array>} Account balances
   */
  async getBalances(accessToken) {
    try {
      const accounts = await mercuryOAuth.getAccounts(accessToken);
      return accounts.map(acc => ({
        accountId: acc.id,
        accountName: acc.name,
        currentBalance: acc.currentBalance,
        availableBalance: acc.availableBalance,
        type: acc.type,
        status: acc.status
      }));
    } catch (error) {
      console.error('[Mercury Sync] Get balances error:', error);
      throw error;
    }
  }
}

module.exports = new MercurySyncService();
