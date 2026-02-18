/**
 * Enable Banking Synchronization Service
 *
 * Fetches transactions from all accounts for the last 3 months
 * and saves them to the database
 */

const axios = require('axios');
const eubanksOAuth = require('./oauth/eubanks-oauth.service');
const connectionsService = require('./connections.service');
const { createClient } = require('@supabase/supabase-js');

class EuBanksSyncService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  /**
   * Sync all accounts and transactions for a user
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} Sync result
   */
  async syncTransactions(userId) {
    try {
      console.log(`[EuBanks Sync] Starting sync for user: ${userId}`);

      // Get user's Enable Banking connection
      const connection = await connectionsService.getConnection(userId, 'eubanks');

      if (!connection) {
        throw new Error('No Enable Banking connection found for user');
      }

      const sessionId = connection.access_token;
      console.log(`[EuBanks Sync] Using session ID: ${sessionId}`);

      // Get session info to retrieve accounts
      const sessionInfo = await eubanksOAuth.getUserInfo(sessionId);
      const accounts = sessionInfo.accounts || [];

      console.log(`[EuBanks Sync] Found ${accounts.length} accounts`);

      if (accounts.length === 0) {
        throw new Error('No accounts found for this connection');
      }

      // Calculate date range (last 3 months)
      const dateFrom = new Date();
      dateFrom.setMonth(dateFrom.getMonth() - 3);
      const dateTo = new Date();

      const dateFromStr = dateFrom.toISOString().split('T')[0]; // YYYY-MM-DD
      const dateToStr = dateTo.toISOString().split('T')[0];

      console.log(`[EuBanks Sync] Fetching transactions from ${dateFromStr} to ${dateToStr}`);

      let totalTransactions = 0;
      let totalInserted = 0;
      let totalDuplicates = 0;
      const accountsSynced = [];

      // Fetch transactions for each account
      for (const account of accounts) {
        const accountUid = account.uid;
        console.log(`[EuBanks Sync] Processing account: ${account.name || accountUid}`);

        try {
          // Fetch transactions for this account
          const transactions = await this.fetchAccountTransactions(
            sessionId,
            accountUid,
            dateFromStr,
            dateToStr
          );

          console.log(`[EuBanks Sync] Fetched ${transactions.length} transactions for account ${accountUid}`);

          // Save transactions to database
          const saveResult = await this.saveTransactions(
            userId,
            connection.id,
            transactions,
            account
          );

          totalTransactions += transactions.length;
          totalInserted += saveResult.inserted;
          totalDuplicates += saveResult.duplicates;

          accountsSynced.push({
            uid: accountUid,
            name: account.name || 'Unknown',
            transactions: transactions.length,
            inserted: saveResult.inserted,
            duplicates: saveResult.duplicates
          });

        } catch (error) {
          console.error(`[EuBanks Sync] Error processing account ${accountUid}:`, error.message);
          // Continue with other accounts even if one fails
          accountsSynced.push({
            uid: accountUid,
            name: account.name || 'Unknown',
            error: error.message
          });
        }
      }

      // Update last synced timestamp
      await connectionsService.updateLastSynced(connection.id);

      // Create sync log
      await connectionsService.createSyncLog(connection.id, userId, {
        sync_type: 'full',
        status: 'success',
        records_synced: totalInserted,
        metadata: {
          accounts: accountsSynced,
          date_range: { from: dateFromStr, to: dateToStr },
          total_transactions: totalTransactions,
          duplicates: totalDuplicates
        }
      });

      console.log(`[EuBanks Sync] ✅ Sync completed successfully`);
      console.log(`[EuBanks Sync] Total: ${totalTransactions}, Inserted: ${totalInserted}, Duplicates: ${totalDuplicates}`);

      return {
        success: true,
        total_transactions: totalTransactions,
        inserted: totalInserted,
        duplicates: totalDuplicates,
        accounts: accountsSynced,
        date_range: { from: dateFromStr, to: dateToStr }
      };

    } catch (error) {
      console.error('[EuBanks Sync] ❌ Sync failed:', error);

      // Create error sync log if we have connection info
      try {
        const connection = await connectionsService.getConnection(userId, 'eubanks');
        if (connection) {
          await connectionsService.createSyncLog(connection.id, userId, {
            sync_type: 'full',
            status: 'error',
            records_synced: 0,
            error_message: error.message
          });
        }
      } catch (logError) {
        console.error('[EuBanks Sync] Failed to create error log:', logError);
      }

      throw error;
    }
  }

  /**
   * Fetch transactions for a specific account
   * @param {string} sessionId - Enable Banking session ID
   * @param {string} accountUid - Account UID
   * @param {string} dateFrom - Start date (YYYY-MM-DD)
   * @param {string} dateTo - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} Array of transactions
   */
  async fetchAccountTransactions(sessionId, accountUid, dateFrom, dateTo) {
    try {
      const url = `${eubanksOAuth.apiBaseUrl}/accounts/${accountUid}/transactions`;
      const params = {
        session_id: sessionId,
        date_from: dateFrom,
        date_to: dateTo
      };

      console.log(`[EuBanks Sync] Fetching from: ${url}`);
      console.log(`[EuBanks Sync] Params:`, params);

      const response = await axios.get(url, {
        headers: eubanksOAuth.getAuthHeaders(),
        params: params
      });

      // Enable Banking returns transactions in response.data.transactions
      const transactions = response.data.transactions || [];

      return transactions;

    } catch (error) {
      console.error('[EuBanks Sync] Error fetching transactions:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Save transactions to database
   * @param {string} userId - User UUID
   * @param {string} connectionId - Connection UUID
   * @param {Array} transactions - Array of transactions from Enable Banking
   * @param {Object} account - Account info
   * @returns {Promise<Object>} Save result
   */
  async saveTransactions(userId, connectionId, transactions, account) {
    try {
      let inserted = 0;
      let duplicates = 0;

      for (const tx of transactions) {
        // Check if transaction already exists (deduplication)
        const { data: existing } = await this.supabase
          .from('transactions')
          .select('id')
          .eq('user_id', userId)
          .eq('provider_transaction_id', tx.transaction_id)
          .eq('source', 'enable_banking')
          .single();

        if (existing) {
          duplicates++;
          continue; // Skip duplicate
        }

        // Parse transaction data
        const transactionDate = tx.booking_date || tx.value_date;
        const amount = Math.abs(parseFloat(tx.amount));
        const isDebit = parseFloat(tx.amount) < 0;

        // Parse datetime - Enable Banking provides dates in YYYY-MM-DD format
        // We'll use booking_date as the primary date and set time to noon UTC
        const dateOnly = transactionDate; // Already in YYYY-MM-DD format
        const dateTime = new Date(transactionDate + 'T12:00:00Z').toISOString(); // Noon UTC as default

        // Prepare transaction record
        const transactionRecord = {
          user_id: userId,
          connection_id: connectionId,
          source: 'enable_banking',
          provider_transaction_id: tx.transaction_id,
          date: dateOnly, // Keep for backwards compatibility
          transaction_datetime: dateTime, // New field with timestamp
          description: tx.remittance_information || tx.description || 'Unknown transaction',
          amount: amount,
          type: isDebit ? 'expense' : 'income',
          currency: tx.currency || account.currency || 'EUR',
          status: tx.status || 'booked',

          // Account info
          account_id: account.uid,
          account_name: account.name || account.iban || 'Unknown Account',

          // Counterparty info
          counterparty_name: tx.creditor_name || tx.debtor_name || null,
          counterparty_id: tx.creditor_account?.iban || tx.debtor_account?.iban || null,

          // Additional metadata
          metadata: {
            booking_date: tx.booking_date,
            value_date: tx.value_date,
            transaction_code: tx.transaction_code,
            bank_transaction_code: tx.bank_transaction_code,
            creditor: tx.creditor_name,
            debtor: tx.debtor_name,
            creditor_account: tx.creditor_account,
            debtor_account: tx.debtor_account
          }
        };

        // Insert transaction
        const { error: insertError } = await this.supabase
          .from('transactions')
          .insert(transactionRecord);

        if (insertError) {
          console.error('[EuBanks Sync] Error inserting transaction:', insertError);
          // Continue with other transactions
        } else {
          inserted++;
        }
      }

      return { inserted, duplicates };

    } catch (error) {
      console.error('[EuBanks Sync] Error saving transactions:', error);
      throw error;
    }
  }

  /**
   * Get accounts for a user's connection
   * @param {string} userId - User UUID
   * @returns {Promise<Array>} Array of accounts
   */
  async getAccounts(userId) {
    try {
      const connection = await connectionsService.getConnection(userId, 'eubanks');

      if (!connection) {
        throw new Error('No Enable Banking connection found');
      }

      const sessionId = connection.access_token;
      const sessionInfo = await eubanksOAuth.getUserInfo(sessionId);

      return sessionInfo.accounts || [];

    } catch (error) {
      console.error('[EuBanks Sync] Error getting accounts:', error);
      throw error;
    }
  }

  /**
   * Get sync status for user
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} Sync status
   */
  async getSyncStatus(userId) {
    try {
      const connection = await connectionsService.getConnection(userId, 'eubanks');

      if (!connection) {
        return {
          connected: false,
          last_synced: null,
          accounts: []
        };
      }

      // Get recent sync logs
      const { data: syncLogs } = await this.supabase
        .from('sync_logs')
        .select('*')
        .eq('connection_id', connection.id)
        .order('created_at', { ascending: false })
        .limit(5);

      const accounts = await this.getAccounts(userId);

      return {
        connected: true,
        last_synced: connection.last_synced_at,
        valid_until: connection.metadata?.valid_until,
        accounts: accounts.map(acc => ({
          uid: acc.uid,
          name: acc.name || acc.iban,
          iban: acc.iban,
          currency: acc.currency
        })),
        recent_syncs: syncLogs || []
      };

    } catch (error) {
      console.error('[EuBanks Sync] Error getting sync status:', error);
      throw error;
    }
  }
}

module.exports = new EuBanksSyncService();
