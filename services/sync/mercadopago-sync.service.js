const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const categorizationService = require('../categorization.service');
const ExchangeRateService = require('../exchange-rate.service');

/**
 * Mercado Pago Sync Service
 * Fetches payments and transactions from Mercado Pago API
 *
 * API Documentation:
 * - Payments: https://www.mercadopago.com.ar/developers/es/reference/payments/_payments_search/get
 * - Money Movements: https://www.mercadopago.com.ar/developers/es/reference
 */
class MercadoPagoSyncService {
  constructor() {
    this.apiBaseUrl = 'https://api.mercadopago.com';
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
    this.exchangeRateService = new ExchangeRateService(this.supabase);
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
        .eq('source', 'mercadopago')
        .order('transaction_date', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      // Use date_created from raw_data for more precision
      const lastDate = data.raw_data?.date_created;
      if (lastDate) {
        return new Date(lastDate);
      }

      return null;
    } catch (error) {
      console.log('[MP Sync] No previous transactions found, will do full sync');
      return null;
    }
  }

  /**
   * Sync payments from Mercado Pago for a user
   * @param {string} userId - User ID
   * @param {string} accessToken - Mercado Pago access token
   * @param {string} connectionId - Connection ID
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} Sync result
   */
  async syncPayments(userId, accessToken, connectionId, options = {}) {
    // Get the last synced date for incremental sync
    const lastSyncedDate = await this.getLastSyncedDate(userId);

    // If we have a last synced date, start from there (add 1 second to avoid duplicates)
    // Otherwise, use the default (3 months ago) or provided fromDate
    let effectiveFromDate;
    if (lastSyncedDate && !options.fromDate) {
      // Add 1 second to last synced date to avoid re-fetching the same transaction
      effectiveFromDate = new Date(lastSyncedDate.getTime() + 1000);
      console.log(`[MP Sync] Incremental sync from last transaction: ${effectiveFromDate.toISOString()}`);
    } else {
      effectiveFromDate = options.fromDate || this.getDefaultFromDate();
      console.log(`[MP Sync] Full sync from: ${effectiveFromDate.toISOString()}`);
    }

    const {
      toDate = new Date(),
      limit = 100
    } = options;

    const fromDate = effectiveFromDate;

    console.log(`[MP Sync] Starting sync for user ${userId}`);
    console.log(`[MP Sync] Date range: ${fromDate.toISOString()} to ${toDate.toISOString()}`);

    try {
      // Fetch all payments with pagination
      const allPayments = await this.fetchAllPayments(accessToken, fromDate, toDate, limit);
      console.log(`[MP Sync] Fetched ${allPayments.length} payments from API`);

      if (allPayments.length === 0) {
        return {
          success: true,
          syncedCount: 0,
          skippedCount: 0,
          message: 'No payments found in the specified date range'
        };
      }

      // Get user info to determine if payment is inbound or outbound
      const userInfo = await this.getUserInfo(accessToken);
      const mpUserId = userInfo.id;

      // Transform payments to transactions with USD conversion
      const transactions = [];
      for (const payment of allPayments) {
        const transaction = await this.transformPaymentToTransaction(payment, userId, connectionId, mpUserId);
        transactions.push(transaction);
      }

      // Save transactions (with deduplication)
      const { syncedCount, skippedCount } = await this.saveTransactions(transactions, userId);

      console.log(`[MP Sync] Sync complete: ${syncedCount} new, ${skippedCount} skipped (duplicates)`);

      return {
        success: true,
        syncedCount,
        skippedCount,
        totalFetched: allPayments.length
      };
    } catch (error) {
      console.error('[MP Sync] Sync error:', error);
      throw error;
    }
  }

  /**
   * Fetch all payments with pagination
   * @param {string} accessToken - Access token
   * @param {Date} fromDate - Start date
   * @param {Date} toDate - End date
   * @param {number} limit - Items per page
   * @returns {Promise<Array>} All payments
   */
  async fetchAllPayments(accessToken, fromDate, toDate, limit = 100) {
    const allPayments = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await this.fetchPaymentsPage(accessToken, fromDate, toDate, offset, limit);

      if (response.results && response.results.length > 0) {
        allPayments.push(...response.results);
        offset += response.results.length;

        // Check if there are more results
        hasMore = response.paging && offset < response.paging.total;

        console.log(`[MP Sync] Fetched page: ${allPayments.length}/${response.paging?.total || '?'} payments`);
      } else {
        hasMore = false;
      }

      // Rate limiting: wait 100ms between requests
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return allPayments;
  }

  /**
   * Fetch a single page of payments
   * @param {string} accessToken - Access token
   * @param {Date} fromDate - Start date
   * @param {Date} toDate - End date
   * @param {number} offset - Pagination offset
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} API response
   */
  async fetchPaymentsPage(accessToken, fromDate, toDate, offset, limit) {
    try {
      // Format dates for API (ISO 8601)
      const beginDate = fromDate.toISOString();
      const endDate = toDate.toISOString();

      const response = await axios.get(`${this.apiBaseUrl}/v1/payments/search`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          sort: 'date_created',
          criteria: 'desc',
          'range': 'date_created',
          'begin_date': beginDate,
          'end_date': endDate,
          offset,
          limit
        }
      });

      return response.data;
    } catch (error) {
      console.error('[MP Sync] Fetch payments error:', error.response?.data || error.message);

      // Handle specific errors
      if (error.response?.status === 401) {
        throw new Error('Token expired or invalid. Please reconnect Mercado Pago.');
      }
      if (error.response?.status === 403) {
        throw new Error('Insufficient permissions. Please reconnect with required scopes.');
      }

      throw new Error(`Failed to fetch payments: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get user info from Mercado Pago
   * @param {string} accessToken - Access token
   * @returns {Promise<Object>} User info
   */
  async getUserInfo(accessToken) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('[MP Sync] Get user info error:', error.response?.data || error.message);
      throw new Error(`Failed to get user info: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Transform a Mercado Pago payment to our transaction format
   * @param {Object} payment - MP payment object
   * @param {string} userId - User ID
   * @param {string} connectionId - Connection ID
   * @param {string} mpUserId - Mercado Pago user ID (to determine direction)
   * @returns {Promise<Object>} Transaction object
   */
  async transformPaymentToTransaction(payment, userId, connectionId, mpUserId) {
    // Determine if this is inbound (collector) or outbound (payer)
    const isInbound = payment.collector_id === mpUserId;

    // Get the counterparty (the other party in the transaction)
    const counterparty = isInbound ? payment.payer : { id: payment.collector_id };

    // Extract collector_id for merchant identification and auto-categorization
    // This helps track repeated merchants (e.g., always same grocery store)
    let collectorId = null;
    if (payment.collector) {
      collectorId = payment.collector.id;
    } else if (payment.collector_id) {
      collectorId = payment.collector_id;
    }

    // Calculate the actual amount (positive for inbound, negative for outbound)
    // Also account for fees for inbound payments
    let amount = payment.transaction_amount;
    if (isInbound) {
      // For inbound payments, we receive the net amount after fees
      amount = payment.transaction_details?.net_received_amount || amount;
    } else {
      // For outbound payments, amount should be negative
      amount = -Math.abs(amount);
    }

    // Parse the date
    const transactionDate = new Date(payment.date_created);
    const dateOnly = transactionDate.toISOString().split('T')[0];

    // Build description
    let description = payment.description || '';
    if (payment.additional_info?.items && payment.additional_info.items.length > 0) {
      const itemDescriptions = payment.additional_info.items.map(item => item.title).join(', ');
      description = description ? `${description} - ${itemDescriptions}` : itemDescriptions;
    }
    if (!description) {
      description = isInbound ? 'Pago recibido' : 'Pago enviado';
    }

    // Convert to USD
    const currency = payment.currency_id || 'ARS';
    const usdConversion = await this.exchangeRateService.convertToUSD(Math.abs(amount), currency, dateOnly);

    return {
      user_id: userId,
      connection_id: connectionId,
      source: 'mercadopago',
      provider_transaction_id: payment.id.toString(),

      transaction_date: dateOnly,
      description: description,
      merchant: counterparty?.email || counterparty?.first_name || null,
      amount: amount,
      transaction_type: isInbound ? 'credit' : 'debit',
      currency: currency,

      // USD conversion fields
      amount_usd: usdConversion?.amountUsd || null,
      exchange_rate: usdConversion?.exchangeRate || null,
      exchange_rate_date: usdConversion?.exchangeRateDate || null,

      status: payment.status,
      payment_method: payment.payment_type_id || payment.payment_method_id,
      operation_type: payment.operation_type,

      counterparty_id: collectorId?.toString() || counterparty?.id?.toString() || null,
      counterparty_name: counterparty?.first_name
        ? `${counterparty.first_name} ${counterparty.last_name || ''}`.trim()
        : null,
      counterparty_email: counterparty?.email || null,

      external_reference: payment.external_reference || null,
      reference_number: payment.id.toString(),

      bank_name: 'Mercado Pago',

      raw_data: {
        id: payment.id,
        date_created: payment.date_created,
        date_approved: payment.date_approved,
        status: payment.status,
        status_detail: payment.status_detail,
        payment_type_id: payment.payment_type_id,
        payment_method_id: payment.payment_method_id,
        operation_type: payment.operation_type,
        transaction_amount: payment.transaction_amount,
        currency_id: payment.currency_id,
        collector_id: payment.collector_id,
        payer: payment.payer,
        fee_details: payment.fee_details,
        transaction_details: payment.transaction_details,
        external_reference: payment.external_reference,
        is_inbound: isInbound
      },

      confidence_score: 100 // Direct API integration = 100% confidence
    };
  }

  /**
   * Save transactions to database with deduplication and auto-categorization
   * @param {Array} transactions - Transactions to save
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Result with counts
   */
  async saveTransactions(transactions, userId) {
    let syncedCount = 0;
    let skippedCount = 0;

    // Step 1: Auto-categorize all transactions before inserting
    console.log(`[MP Sync] Auto-categorizing ${transactions.length} transactions...`);
    const categorizedTransactions = await categorizationService.autoCategorizeTransactions(
      transactions,
      userId
    );

    for (const transaction of categorizedTransactions) {
      try {
        // Check if transaction already exists (deduplication)
        const { data: existing } = await this.supabase
          .from('transactions')
          .select('id')
          .eq('user_id', userId)
          .eq('source', 'mercadopago')
          .eq('provider_transaction_id', transaction.provider_transaction_id)
          .single();

        if (existing) {
          skippedCount++;
          continue;
        }

        // Insert new transaction with category_id
        const { error } = await this.supabase
          .from('transactions')
          .insert(transaction);

        if (error) {
          console.error('[MP Sync] Insert error:', error);
          // Continue with other transactions even if one fails
          continue;
        }

        syncedCount++;
      } catch (error) {
        // PGRST116 means no rows found (expected for new transactions)
        if (error.code !== 'PGRST116') {
          console.error('[MP Sync] Transaction save error:', error);
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
          console.error('[MP Sync] Insert retry error:', e);
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
   * Get payment details by ID
   * @param {string} accessToken - Access token
   * @param {string} paymentId - Payment ID
   * @returns {Promise<Object>} Payment details
   */
  async getPaymentDetails(accessToken, paymentId) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('[MP Sync] Get payment details error:', error.response?.data || error.message);
      throw new Error(`Failed to get payment details: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get account balance
   * @param {string} accessToken - Access token
   * @returns {Promise<Object>} Balance info
   */
  async getBalance(accessToken) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/users/me/mercadopago_account/balance`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('[MP Sync] Get balance error:', error.response?.data || error.message);
      throw new Error(`Failed to get balance: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = new MercadoPagoSyncService();
