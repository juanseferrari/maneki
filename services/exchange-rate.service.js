/**
 * Exchange Rate Service
 * Handles currency conversion to USD using DolarAPI.com
 * Caches rates in database to minimize API calls
 */

const axios = require('axios');

class ExchangeRateService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.API_BASE_URL = 'https://dolarapi.com/v1/dolares/oficial';
  }

  /**
   * Get exchange rate for a given currency and date
   * First checks cache, then fetches from API if needed
   */
  async getExchangeRate(currencyFrom, date, currencyTo = 'USD') {
    // USD to USD is always 1
    if (currencyFrom === currencyTo) {
      return { rate: 1.0, date, source: 'system' };
    }

    // Only support ARS for now (per requirements)
    if (currencyFrom !== 'ARS') {
      throw new Error(`Currency ${currencyFrom} not supported yet. Only ARS is supported.`);
    }

    // Format date as YYYY-MM-DD
    const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;

    // Try to get from cache first
    const cachedRate = await this.getCachedRate(currencyFrom, currencyTo, dateStr);
    if (cachedRate) {
      return cachedRate;
    }

    // Fetch from API and cache
    return await this.fetchAndCacheRate(currencyFrom, currencyTo, dateStr);
  }

  /**
   * Get cached rate from database
   */
  async getCachedRate(currencyFrom, currencyTo, date) {
    try {
      const { data, error } = await this.supabase
        .from('exchange_rates')
        .select('rate, date, source')
        .eq('currency_from', currencyFrom)
        .eq('currency_to', currencyTo)
        .eq('date', date)
        .single();

      if (error || !data) return null;

      return {
        rate: parseFloat(data.rate),
        date: data.date,
        source: data.source
      };
    } catch (err) {
      console.error('Error fetching cached rate:', err);
      return null;
    }
  }

  /**
   * Fetch rate from DolarAPI.com and cache it
   */
  async fetchAndCacheRate(currencyFrom, currencyTo, date) {
    try {
      // DolarAPI.com returns current rate (doesn't support historical dates)
      // So we use current rate for any date
      const response = await axios.get(this.API_BASE_URL, {
        timeout: 5000,
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.data || !response.data.venta) {
        throw new Error('Invalid response from DolarAPI');
      }

      // Use "venta" (sell rate) for conversions
      const rate = parseFloat(response.data.venta);

      // Cache the rate
      await this.cacheRate(currencyFrom, currencyTo, date, rate);

      return {
        rate,
        date,
        source: 'dolarapi.com'
      };
    } catch (err) {
      console.error('Error fetching rate from API:', err.message);
      throw new Error(`Failed to fetch exchange rate: ${err.message}`);
    }
  }

  /**
   * Cache exchange rate in database
   */
  async cacheRate(currencyFrom, currencyTo, date, rate) {
    try {
      const { error } = await this.supabase
        .from('exchange_rates')
        .upsert({
          date,
          currency_from: currencyFrom,
          currency_to: currencyTo,
          rate,
          source: 'dolarapi.com',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'date,currency_from,currency_to'
        });

      if (error) {
        console.error('Error caching rate:', error);
      }
    } catch (err) {
      console.error('Error in cacheRate:', err);
    }
  }

  /**
   * Convert amount to USD
   * Returns null if conversion fails (so transaction can be saved without conversion)
   */
  async convertToUSD(amount, currency, date = new Date()) {
    try {
      // Already in USD
      if (currency === 'USD') {
        return {
          amountUsd: amount,
          exchangeRate: 1.0,
          exchangeRateDate: date instanceof Date ? date.toISOString().split('T')[0] : date
        };
      }

      // Get exchange rate
      const rateInfo = await this.getExchangeRate(currency, date);

      // Calculate USD amount
      const amountUsd = amount / rateInfo.rate;

      return {
        amountUsd: Math.round(amountUsd * 100) / 100, // Round to 2 decimals
        exchangeRate: rateInfo.rate,
        exchangeRateDate: rateInfo.date
      };
    } catch (err) {
      console.error(`Error converting ${amount} ${currency} to USD:`, err.message);
      return null; // Return null to allow saving transaction without conversion
    }
  }

  /**
   * Process transactions that don't have USD conversion yet
   * This is used by the daily cron job
   */
  async processUnconvertedTransactions(userId = null) {
    try {
      console.log('Starting to process unconverted transactions...');

      // Build query for unconverted transactions
      let query = this.supabase
        .from('transactions')
        .select('id, amount, currency, date')
        .is('amount_usd', null)
        .not('currency', 'is', null)
        .neq('currency', 'USD');

      // Optionally filter by user
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: transactions, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch unconverted transactions: ${error.message}`);
      }

      if (!transactions || transactions.length === 0) {
        console.log('No unconverted transactions found');
        return { processed: 0, failed: 0 };
      }

      console.log(`Found ${transactions.length} transactions to convert`);

      let processed = 0;
      let failed = 0;

      // Process in batches to avoid overwhelming the API
      const BATCH_SIZE = 50;
      for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
        const batch = transactions.slice(i, i + BATCH_SIZE);

        for (const tx of batch) {
          try {
            const conversion = await this.convertToUSD(tx.amount, tx.currency, tx.date);

            if (conversion) {
              // Update transaction with USD conversion
              const { error: updateError } = await this.supabase
                .from('transactions')
                .update({
                  amount_usd: conversion.amountUsd,
                  exchange_rate: conversion.exchangeRate,
                  exchange_rate_date: conversion.exchangeRateDate,
                  updated_at: new Date().toISOString()
                })
                .eq('id', tx.id);

              if (updateError) {
                console.error(`Failed to update transaction ${tx.id}:`, updateError);
                failed++;
              } else {
                processed++;
              }
            } else {
              failed++;
            }
          } catch (err) {
            console.error(`Error processing transaction ${tx.id}:`, err.message);
            failed++;
          }
        }

        // Small delay between batches to be nice to the API
        if (i + BATCH_SIZE < transactions.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`Finished processing: ${processed} successful, ${failed} failed`);
      return { processed, failed };
    } catch (err) {
      console.error('Error in processUnconvertedTransactions:', err);
      throw err;
    }
  }

  /**
   * Daily cron job to update rates and process pending conversions
   * This should be called once per day
   */
  async processDailyCron() {
    console.log('===== Starting daily exchange rate cron job =====');
    const startTime = Date.now();

    try {
      // 1. Fetch today's rate and cache it
      const today = new Date().toISOString().split('T')[0];
      console.log(`Fetching rate for ${today}...`);

      await this.getExchangeRate('ARS', today, 'USD');
      console.log('✓ Today\'s rate cached successfully');

      // 2. Process all unconverted transactions
      console.log('Processing unconverted transactions...');
      const result = await this.processUnconvertedTransactions();
      console.log(`✓ Processed ${result.processed} transactions (${result.failed} failed)`);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`===== Daily cron job completed in ${duration}s =====`);

      return result;
    } catch (err) {
      console.error('===== Daily cron job failed =====');
      console.error(err);
      throw err;
    }
  }
}

module.exports = ExchangeRateService;
