const { createClient } = require('@supabase/supabase-js');

/**
 * Recurring Services Service
 * Handles detection, management, and prediction of recurring payments
 */
class RecurringServicesService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );

    // Frequency detection thresholds (in days)
    this.frequencyRanges = {
      weekly: { min: 5, max: 9, days: 7 },
      biweekly: { min: 12, max: 16, days: 14 },
      monthly: { min: 25, max: 35, days: 30 },
      bimonthly: { min: 55, max: 70, days: 60 },
      quarterly: { min: 85, max: 100, days: 90 },
      semiannual: { min: 170, max: 200, days: 180 },
      annual: { min: 350, max: 380, days: 365 }
    };

    // Common service patterns for better detection
    this.knownServices = [
      { patterns: ['netflix'], name: 'Netflix', category: 'streaming', frequency: 'monthly' },
      { patterns: ['spotify'], name: 'Spotify', category: 'streaming', frequency: 'monthly' },
      { patterns: ['disney', 'disney+'], name: 'Disney+', category: 'streaming', frequency: 'monthly' },
      { patterns: ['hbo', 'max'], name: 'HBO Max', category: 'streaming', frequency: 'monthly' },
      { patterns: ['amazon prime', 'prime video'], name: 'Amazon Prime', category: 'streaming', frequency: 'monthly' },
      { patterns: ['youtube', 'google youtube'], name: 'YouTube Premium', category: 'streaming', frequency: 'monthly' },
      { patterns: ['apple', 'itunes'], name: 'Apple Services', category: 'streaming', frequency: 'monthly' },
      { patterns: ['edenor'], name: 'Edenor', category: 'utilities', frequency: 'bimonthly' },
      { patterns: ['edesur'], name: 'Edesur', category: 'utilities', frequency: 'bimonthly' },
      { patterns: ['metrogas'], name: 'Metrogas', category: 'utilities', frequency: 'bimonthly' },
      { patterns: ['aysa'], name: 'AySA', category: 'utilities', frequency: 'bimonthly' },
      { patterns: ['telecentro'], name: 'Telecentro', category: 'telecommunications', frequency: 'monthly' },
      { patterns: ['fibertel', 'cablevision'], name: 'Fibertel/Cablevisión', category: 'telecommunications', frequency: 'monthly' },
      { patterns: ['movistar', 'telefonica'], name: 'Movistar', category: 'telecommunications', frequency: 'monthly' },
      { patterns: ['claro'], name: 'Claro', category: 'telecommunications', frequency: 'monthly' },
      { patterns: ['personal'], name: 'Personal', category: 'telecommunications', frequency: 'monthly' },
      { patterns: ['expensas', 'consorcio', 'administracion'], name: 'Expensas', category: 'housing', frequency: 'monthly' },
      { patterns: ['alquiler', 'rent'], name: 'Alquiler', category: 'housing', frequency: 'monthly' },
      { patterns: ['gimnasio', 'gym', 'megatlon', 'sportclub'], name: 'Gimnasio', category: 'memberships', frequency: 'monthly' },
      { patterns: ['seguro', 'insurance', 'la caja', 'sancor'], name: 'Seguro', category: 'insurance', frequency: 'monthly' },
      { patterns: ['chatgpt', 'openai'], name: 'ChatGPT Plus', category: 'subscriptions', frequency: 'monthly' },
      { patterns: ['claude', 'anthropic'], name: 'Claude Pro', category: 'subscriptions', frequency: 'monthly' },
      { patterns: ['github'], name: 'GitHub', category: 'subscriptions', frequency: 'monthly' },
      { patterns: ['slack'], name: 'Slack', category: 'subscriptions', frequency: 'monthly' },
      { patterns: ['notion'], name: 'Notion', category: 'subscriptions', frequency: 'monthly' },
      { patterns: ['dropbox'], name: 'Dropbox', category: 'subscriptions', frequency: 'monthly' },
      { patterns: ['google storage', 'google one'], name: 'Google One', category: 'subscriptions', frequency: 'monthly' },
      { patterns: ['icloud'], name: 'iCloud', category: 'subscriptions', frequency: 'monthly' }
    ];

    // Category colors
    this.categoryColors = {
      streaming: '#E91E63',
      utilities: '#4CAF50',
      telecommunications: '#2196F3',
      insurance: '#FF9800',
      subscriptions: '#9C27B0',
      memberships: '#00BCD4',
      housing: '#795548',
      loans: '#F44336',
      other: '#607D8B'
    };
  }

  /**
   * Normalize merchant/description for matching
   */
  normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s]/g, '') // Remove special chars
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Detect recurring services from user's transactions
   * @param {string} userId - User ID
   * @param {Object} options - Detection options
   * @returns {Promise<Array>} Detected services
   */
  async detectRecurringServices(userId, options = {}) {
    const { minOccurrences = 2, lookbackMonths = 12 } = options;

    console.log(`[Recurring] Starting detection for user ${userId}`);

    // Fetch existing services to filter out already tracked ones
    const { data: existingServices } = await this.supabase
      .from('recurring_services')
      .select('name, normalized_name, merchant_patterns')
      .eq('user_id', userId)
      .in('status', ['active', 'paused']);

    const existingNames = new Set();
    const existingPatterns = new Set();

    if (existingServices) {
      for (const svc of existingServices) {
        existingNames.add(this.normalizeText(svc.name));
        if (svc.normalized_name) existingNames.add(svc.normalized_name.toLowerCase());
        if (svc.merchant_patterns) {
          for (const pattern of svc.merchant_patterns) {
            existingPatterns.add(pattern.toLowerCase());
          }
        }
      }
    }
    console.log(`[Recurring] Found ${existingServices?.length || 0} existing services to exclude`);

    // Fetch transactions for analysis
    const lookbackDate = new Date();
    lookbackDate.setMonth(lookbackDate.getMonth() - lookbackMonths);

    const { data: transactions, error } = await this.supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gte('transaction_date', lookbackDate.toISOString().split('T')[0])
      .order('transaction_date', { ascending: true });

    if (error) {
      console.error('[Recurring] Error fetching transactions:', error);
      throw error;
    }

    console.log(`[Recurring] Analyzing ${transactions.length} transactions`);

    // Group transactions by normalized merchant/description
    const groups = this.groupTransactionsByMerchant(transactions);

    // Analyze each group for recurrence patterns
    const detectedServices = [];

    for (const [key, txns] of Object.entries(groups)) {
      if (txns.length < minOccurrences) continue;

      // Skip if this service already exists
      const normalizedKey = key.toLowerCase();
      if (existingNames.has(normalizedKey) || existingPatterns.has(normalizedKey)) {
        console.log(`[Recurring] Skipping "${key}" - already tracked`);
        continue;
      }

      const analysis = this.analyzeTransactionGroup(txns);

      if (analysis.isRecurring) {
        // Check if matches a known service
        const knownService = this.matchKnownService(key);

        // Also check if the service name already exists
        const serviceName = knownService?.name || this.formatServiceName(txns[0]);
        const normalizedServiceName = this.normalizeText(serviceName);
        if (existingNames.has(normalizedServiceName)) {
          console.log(`[Recurring] Skipping "${serviceName}" - already tracked by name`);
          continue;
        }

        detectedServices.push({
          normalized_name: key,
          name: serviceName,
          category: knownService?.category || analysis.suggestedCategory || 'other',
          frequency: knownService?.frequency || analysis.frequency,
          estimated_amount: analysis.averageAmount,
          amount_varies: analysis.amountVaries,
          min_amount: analysis.minAmount,
          max_amount: analysis.maxAmount,
          currency: txns[0].currency || 'ARS',
          typical_day_of_month: analysis.typicalDay,
          first_payment_date: txns[0].transaction_date,
          last_payment_date: txns[txns.length - 1].transaction_date,
          next_expected_date: analysis.nextExpectedDate,
          is_auto_detected: true,
          auto_detection_confidence: analysis.confidence,
          merchant_patterns: [key],
          color: this.categoryColors[knownService?.category || 'other'],
          transactions: txns, // Include for linking
          occurrence_count: txns.length
        });
      }
    }

    console.log(`[Recurring] Detected ${detectedServices.length} potential recurring services`);

    // Sort by confidence
    detectedServices.sort((a, b) => b.auto_detection_confidence - a.auto_detection_confidence);

    return detectedServices;
  }

  /**
   * Group transactions by normalized merchant/description
   */
  groupTransactionsByMerchant(transactions) {
    const groups = {};

    for (const tx of transactions) {
      // Only consider debits (payments)
      if (tx.amount > 0) continue;

      // Get merchant identifier
      const merchantKey = this.normalizeText(tx.merchant || tx.description || '');
      if (!merchantKey || merchantKey.length < 3) continue;

      // Further normalize to group similar merchants
      const groupKey = this.getGroupKey(merchantKey);

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(tx);
    }

    return groups;
  }

  /**
   * Get a normalized group key for a merchant
   */
  getGroupKey(merchantKey) {
    // Check against known services first
    for (const service of this.knownServices) {
      for (const pattern of service.patterns) {
        if (merchantKey.includes(pattern)) {
          return pattern;
        }
      }
    }

    // Extract main identifier (first 2-3 significant words)
    const words = merchantKey.split(' ').filter(w => w.length > 2);
    if (words.length === 0) return merchantKey;

    // Take first 2 significant words as key
    return words.slice(0, 2).join(' ');
  }

  /**
   * Analyze a group of transactions for recurrence patterns
   */
  analyzeTransactionGroup(transactions) {
    if (transactions.length < 2) {
      return { isRecurring: false };
    }

    // Calculate intervals between payments
    const intervals = [];
    for (let i = 1; i < transactions.length; i++) {
      const date1 = new Date(transactions[i - 1].transaction_date);
      const date2 = new Date(transactions[i].transaction_date);
      const daysDiff = Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
      intervals.push(daysDiff);
    }

    // Detect frequency based on average interval
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const frequency = this.detectFrequency(avgInterval);

    if (!frequency) {
      return { isRecurring: false };
    }

    // Calculate interval consistency (standard deviation)
    const expectedInterval = this.frequencyRanges[frequency].days;
    const variance = intervals.reduce((sum, interval) => {
      return sum + Math.pow(interval - expectedInterval, 2);
    }, 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // Confidence based on consistency and number of occurrences
    const consistencyScore = Math.max(0, 100 - (stdDev * 2));
    const occurrenceBonus = Math.min(20, transactions.length * 2);
    const confidence = Math.min(100, consistencyScore + occurrenceBonus);

    // Consider recurring if confidence > 50%
    if (confidence < 50) {
      return { isRecurring: false };
    }

    // Analyze amounts
    const amounts = transactions.map(tx => Math.abs(tx.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const minAmount = Math.min(...amounts);
    const maxAmount = Math.max(...amounts);
    const amountVariation = ((maxAmount - minAmount) / avgAmount) * 100;
    const amountVaries = amountVariation > 10;

    // Calculate typical day of month
    const days = transactions.map(tx => new Date(tx.transaction_date).getDate());
    const typicalDay = Math.round(days.reduce((a, b) => a + b, 0) / days.length);

    // Predict next payment date
    const lastDate = new Date(transactions[transactions.length - 1].transaction_date);
    const nextExpectedDate = this.calculateNextDate(lastDate, frequency, typicalDay);

    // Suggest category based on amount patterns
    let suggestedCategory = 'other';
    if (avgAmount < 2000) suggestedCategory = 'subscriptions';
    else if (avgAmount < 10000) suggestedCategory = 'streaming';
    else if (amountVaries && avgAmount > 10000) suggestedCategory = 'utilities';

    return {
      isRecurring: true,
      frequency,
      averageAmount: Math.round(avgAmount * 100) / 100,
      minAmount: Math.round(minAmount * 100) / 100,
      maxAmount: Math.round(maxAmount * 100) / 100,
      amountVaries,
      typicalDay,
      nextExpectedDate,
      confidence: Math.round(confidence),
      suggestedCategory,
      intervalStats: {
        average: avgInterval,
        stdDev,
        consistency: consistencyScore
      }
    };
  }

  /**
   * Detect frequency from average interval
   */
  detectFrequency(avgInterval) {
    for (const [freq, range] of Object.entries(this.frequencyRanges)) {
      if (avgInterval >= range.min && avgInterval <= range.max) {
        return freq;
      }
    }
    return null;
  }

  /**
   * Calculate next expected payment date
   */
  calculateNextDate(lastDate, frequency, typicalDay) {
    const date = new Date(lastDate);

    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'biweekly':
        date.setDate(date.getDate() + 14);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'bimonthly':
        date.setMonth(date.getMonth() + 2);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + 3);
        break;
      case 'semiannual':
        date.setMonth(date.getMonth() + 6);
        break;
      case 'annual':
        date.setFullYear(date.getFullYear() + 1);
        break;
    }

    // Adjust to typical day if monthly-based
    if (['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'].includes(frequency) && typicalDay) {
      const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(typicalDay, lastDayOfMonth));
    }

    return date.toISOString().split('T')[0];
  }

  /**
   * Match against known services
   */
  matchKnownService(normalizedName) {
    for (const service of this.knownServices) {
      for (const pattern of service.patterns) {
        if (normalizedName.includes(pattern)) {
          return service;
        }
      }
    }
    return null;
  }

  /**
   * Format a nice service name from transaction
   */
  formatServiceName(transaction) {
    const source = transaction.merchant || transaction.description || '';
    // Capitalize first letter of each word
    return source
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .substring(0, 50);
  }

  // ==========================================
  // CRUD Operations
  // ==========================================

  /**
   * Get all recurring services for a user
   */
  async getServices(userId, options = {}) {
    const { status = 'active', includePayments = false } = options;

    let query = this.supabase
      .from('recurring_services')
      .select('*')
      .eq('user_id', userId)
      .order('next_expected_date', { ascending: true });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: services, error } = await query;

    if (error) throw error;

    // Optionally include recent payments
    if (includePayments && services.length > 0) {
      const serviceIds = services.map(s => s.id);
      const { data: payments } = await this.supabase
        .from('service_payments')
        .select('*')
        .in('service_id', serviceIds)
        .order('payment_date', { ascending: false })
        .limit(5);

      // Attach payments to services
      for (const service of services) {
        service.recent_payments = payments?.filter(p => p.service_id === service.id) || [];
      }
    }

    return services;
  }

  /**
   * Get a single service by ID
   */
  async getService(userId, serviceId) {
    const { data, error } = await this.supabase
      .from('recurring_services')
      .select('*')
      .eq('user_id', userId)
      .eq('id', serviceId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Create a new recurring service
   */
  async createService(userId, serviceData) {
    const service = {
      user_id: userId,
      name: serviceData.name,
      normalized_name: this.normalizeText(serviceData.name),
      description: serviceData.description,
      category: serviceData.category || 'other',
      frequency: serviceData.frequency || 'monthly',
      typical_day_of_month: serviceData.typical_day_of_month,
      estimated_amount: serviceData.estimated_amount,
      amount_varies: serviceData.amount_varies || false,
      min_amount: serviceData.min_amount,
      max_amount: serviceData.max_amount,
      currency: serviceData.currency || 'ARS',
      payment_method: serviceData.payment_method,
      status: 'active',
      is_auto_detected: serviceData.is_auto_detected || false,
      auto_detection_confidence: serviceData.auto_detection_confidence,
      first_payment_date: serviceData.first_payment_date,
      last_payment_date: serviceData.last_payment_date,
      next_expected_date: serviceData.next_expected_date,
      merchant_patterns: serviceData.merchant_patterns || [this.normalizeText(serviceData.name)],
      notes: serviceData.notes,
      color: serviceData.color || this.categoryColors[serviceData.category] || this.categoryColors.other
    };

    // Calculate next expected date if not provided
    if (!service.next_expected_date && service.last_payment_date) {
      service.next_expected_date = this.calculateNextDate(
        new Date(service.last_payment_date),
        service.frequency,
        service.typical_day_of_month
      );
    }

    const { data, error } = await this.supabase
      .from('recurring_services')
      .insert(service)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update a recurring service
   */
  async updateService(userId, serviceId, updates) {
    // Normalize name if being updated
    if (updates.name) {
      updates.normalized_name = this.normalizeText(updates.name);
    }

    // Update color if category changed
    if (updates.category && !updates.color) {
      updates.color = this.categoryColors[updates.category] || this.categoryColors.other;
    }

    const { data, error } = await this.supabase
      .from('recurring_services')
      .update(updates)
      .eq('user_id', userId)
      .eq('id', serviceId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a recurring service
   */
  async deleteService(userId, serviceId) {
    const { error } = await this.supabase
      .from('recurring_services')
      .delete()
      .eq('user_id', userId)
      .eq('id', serviceId);

    if (error) throw error;
    return true;
  }

  /**
   * Save detected services (with user confirmation)
   */
  async saveDetectedServices(userId, detectedServices) {
    const results = {
      created: 0,
      linked: 0,
      errors: []
    };

    for (const detected of detectedServices) {
      try {
        // Create the service
        const service = await this.createService(userId, detected);

        // Link existing transactions
        if (detected.transactions && detected.transactions.length > 0) {
          for (const tx of detected.transactions) {
            await this.linkTransactionToService(userId, service.id, tx.id, {
              payment_date: tx.transaction_date,
              amount: Math.abs(tx.amount),
              currency: tx.currency || 'ARS',
              status: 'paid',
              match_confidence: detected.auto_detection_confidence,
              matched_by: 'auto'
            });
            results.linked++;
          }
        }

        results.created++;
      } catch (error) {
        console.error('[Recurring] Error saving service:', error);
        results.errors.push({ service: detected.name, error: error.message });
      }
    }

    return results;
  }

  // ==========================================
  // Payment Linking
  // ==========================================

  /**
   * Link a transaction to a service
   */
  async linkTransactionToService(userId, serviceId, transactionId, paymentData = {}) {
    const payment = {
      service_id: serviceId,
      transaction_id: transactionId,
      user_id: userId,
      payment_date: paymentData.payment_date || new Date().toISOString().split('T')[0],
      amount: paymentData.amount,
      currency: paymentData.currency || 'ARS',
      status: paymentData.status || 'paid',
      is_predicted: paymentData.is_predicted || false,
      match_confidence: paymentData.match_confidence || 100,
      matched_by: paymentData.matched_by || 'manual'
    };

    const { data, error } = await this.supabase
      .from('service_payments')
      .insert(payment)
      .select()
      .single();

    if (error) throw error;

    // Update service's last payment date
    await this.updateServicePaymentDates(userId, serviceId);

    return data;
  }

  /**
   * Unlink a transaction from a service
   */
  async unlinkTransaction(userId, paymentId) {
    const { data: payment, error: fetchError } = await this.supabase
      .from('service_payments')
      .select('service_id')
      .eq('user_id', userId)
      .eq('id', paymentId)
      .single();

    if (fetchError) throw fetchError;

    const { error } = await this.supabase
      .from('service_payments')
      .delete()
      .eq('user_id', userId)
      .eq('id', paymentId);

    if (error) throw error;

    // Update service dates
    if (payment?.service_id) {
      await this.updateServicePaymentDates(userId, payment.service_id);
    }

    return true;
  }

  /**
   * Get payments for a service
   */
  async getServicePayments(userId, serviceId, options = {}) {
    const { limit = 50, includeTransactionDetails = false } = options;

    let query = this.supabase
      .from('service_payments')
      .select(includeTransactionDetails ? '*, transactions(*)' : '*')
      .eq('user_id', userId)
      .eq('service_id', serviceId)
      .order('payment_date', { ascending: false })
      .limit(limit);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  /**
   * Update service's payment date fields
   */
  async updateServicePaymentDates(userId, serviceId) {
    // Get latest payment
    const { data: payments } = await this.supabase
      .from('service_payments')
      .select('payment_date')
      .eq('service_id', serviceId)
      .eq('status', 'paid')
      .order('payment_date', { ascending: false })
      .limit(1);

    if (payments && payments.length > 0) {
      const lastPayment = payments[0];

      // Get the service to calculate next date
      const { data: service } = await this.supabase
        .from('recurring_services')
        .select('frequency, typical_day_of_month')
        .eq('id', serviceId)
        .single();

      const nextDate = this.calculateNextDate(
        new Date(lastPayment.payment_date),
        service?.frequency || 'monthly',
        service?.typical_day_of_month
      );

      await this.supabase
        .from('recurring_services')
        .update({
          last_payment_date: lastPayment.payment_date,
          next_expected_date: nextDate
        })
        .eq('id', serviceId);
    }
  }

  // ==========================================
  // Calendar / Predictions
  // ==========================================

  /**
   * Get upcoming payments for calendar view
   */
  async getUpcomingPayments(userId, options = {}) {
    const { months = 3 } = options;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    // Get active services
    const { data: services, error } = await this.supabase
      .from('recurring_services')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) throw error;

    const predictions = [];

    for (const service of services) {
      // Generate predicted payments for the period
      let currentDate = service.next_expected_date
        ? new Date(service.next_expected_date)
        : this.calculateNextDate(
            service.last_payment_date ? new Date(service.last_payment_date) : new Date(),
            service.frequency,
            service.typical_day_of_month
          );

      // Make sure currentDate is a Date object
      if (typeof currentDate === 'string') {
        currentDate = new Date(currentDate);
      }

      while (currentDate <= endDate) {
        if (currentDate >= startDate) {
          predictions.push({
            service_id: service.id,
            service_name: service.name,
            category: service.category,
            color: service.color,
            predicted_date: currentDate.toISOString().split('T')[0],
            estimated_amount: service.estimated_amount,
            amount_varies: service.amount_varies,
            min_amount: service.min_amount,
            max_amount: service.max_amount,
            currency: service.currency,
            frequency: service.frequency,
            is_predicted: true
          });
        }

        // Calculate next occurrence
        const nextDateStr = this.calculateNextDate(currentDate, service.frequency, service.typical_day_of_month);
        currentDate = new Date(nextDateStr);
      }
    }

    // Sort by date
    predictions.sort((a, b) => new Date(a.predicted_date) - new Date(b.predicted_date));

    return predictions;
  }

  /**
   * Get payments for a specific month (calendar view)
   */
  async getMonthPayments(userId, year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // Get actual payments in this month
    const { data: actualPayments, error: paymentError } = await this.supabase
      .from('service_payments')
      .select('*, recurring_services(*)')
      .eq('user_id', userId)
      .gte('payment_date', startDate.toISOString().split('T')[0])
      .lte('payment_date', endDate.toISOString().split('T')[0]);

    if (paymentError) throw paymentError;

    // Get predicted payments for services without actual payment this month
    const services = await this.getServices(userId);
    const predictions = [];

    for (const service of services) {
      // Check if there's already a payment for this service this month
      const hasPayment = actualPayments?.some(p => p.service_id === service.id);

      if (!hasPayment && service.next_expected_date) {
        const expectedDate = new Date(service.next_expected_date);
        if (expectedDate >= startDate && expectedDate <= endDate) {
          predictions.push({
            service_id: service.id,
            service_name: service.name,
            category: service.category,
            color: service.color,
            predicted_date: service.next_expected_date,
            estimated_amount: service.estimated_amount,
            currency: service.currency,
            is_predicted: true
          });
        }
      }
    }

    return {
      actual: actualPayments || [],
      predicted: predictions
    };
  }

  // ==========================================
  // Auto-matching new transactions
  // ==========================================

  /**
   * Try to match a new transaction to existing services
   */
  async matchTransactionToServices(userId, transaction) {
    if (transaction.amount > 0) return null; // Only match debits

    const normalizedMerchant = this.normalizeText(transaction.merchant || transaction.description);
    if (!normalizedMerchant) return null;

    // Get user's services
    const { data: services } = await this.supabase
      .from('recurring_services')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (!services || services.length === 0) return null;

    // Try to match
    for (const service of services) {
      const patterns = service.merchant_patterns || [service.normalized_name];

      for (const pattern of patterns) {
        if (normalizedMerchant.includes(pattern) || pattern.includes(normalizedMerchant)) {
          // Found a match!
          return {
            service,
            confidence: 85, // Good match but not perfect
            matchedPattern: pattern
          };
        }
      }
    }

    return null;
  }

  /**
   * Auto-link a transaction if it matches a service
   */
  async autoLinkTransaction(userId, transaction) {
    const match = await this.matchTransactionToServices(userId, transaction);

    if (match) {
      await this.linkTransactionToService(userId, match.service.id, transaction.id, {
        payment_date: transaction.transaction_date,
        amount: Math.abs(transaction.amount),
        currency: transaction.currency || 'ARS',
        status: 'paid',
        match_confidence: match.confidence,
        matched_by: 'auto'
      });

      console.log(`[Recurring] Auto-linked transaction to service: ${match.service.name}`);
      return match.service;
    }

    return null;
  }

  /**
   * Get service linked to a transaction
   */
  async getTransactionService(userId, transactionId) {
    const { data, error } = await this.supabase
      .from('service_payments')
      .select('*, recurring_services(*)')
      .eq('user_id', userId)
      .eq('transaction_id', transactionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No service linked
      }
      throw error;
    }

    return data;
  }

  /**
   * Find potential matches for a transaction
   * Returns all services that could match with confidence score
   */
  async findPotentialMatches(userId, transactionId) {
    // Get transaction
    const { data: transaction, error: txError } = await this.supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('user_id', userId)
      .single();

    if (txError) throw txError;

    // Get all active services
    const { data: services, error: svcError } = await this.supabase
      .from('recurring_services')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (svcError) throw svcError;

    // Calculate confidence for each service
    const matches = [];
    for (const service of services) {
      const confidence = this.calculateMatchConfidence(service, transaction);
      if (confidence >= 50) { // Only show matches with >50% confidence
        matches.push({
          ...service,  // Spread service properties at the top level
          confidence,
          reasons: this.getMatchReasons(service, transaction, confidence)
        });
      }
    }

    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches;
  }

  /**
   * Calculate match confidence between service and transaction
   */
  calculateMatchConfidence(service, transaction) {
    let score = 0;

    // 1. Keyword match in description (40 points)
    const descLower = this.normalizeText(transaction.description || '');
    const serviceName = this.normalizeText(service.name);
    const patterns = service.merchant_patterns || [serviceName];

    for (const pattern of patterns) {
      if (descLower.includes(this.normalizeText(pattern))) {
        score += 40;
        break;
      }
    }

    // 2. Amount similarity (30 points)
    if (service.estimated_amount) {
      const txAmount = Math.abs(transaction.amount);
      const amountDiff = Math.abs(txAmount - service.estimated_amount);
      const tolerance = service.estimated_amount * 0.10; // 10% tolerance

      if (amountDiff <= tolerance) {
        score += 30 * (1 - amountDiff / tolerance);
      }
    }

    // 3. Day of month match (20 points)
    if (service.typical_day_of_month) {
      const txDay = new Date(transaction.transaction_date).getDate();
      const dayDiff = Math.abs(txDay - service.typical_day_of_month);

      if (dayDiff <= 3) { // Within 3 days
        score += 20 * (1 - dayDiff / 3);
      }
    }

    // 4. Category match (10 points)
    if (transaction.category && service.category) {
      const txCategoryName = transaction.category; // Assuming category ID or name
      if (this.normalizeText(txCategoryName).includes(this.normalizeText(service.category))) {
        score += 10;
      }
    }

    return Math.round(score);
  }

  /**
   * Get human-readable reasons for match
   */
  getMatchReasons(service, transaction, confidence) {
    const reasons = [];

    if (confidence >= 75) {
      reasons.push('Alta coincidencia detectada');
    }

    const descLower = this.normalizeText(transaction.description || '');
    const serviceName = this.normalizeText(service.name);
    if (descLower.includes(serviceName)) {
      reasons.push(`Nombre coincide: "${service.name}"`);
    }

    if (service.estimated_amount) {
      const diff = Math.abs(Math.abs(transaction.amount) - service.estimated_amount);
      if (diff / service.estimated_amount < 0.1) {
        reasons.push(`Monto similar: $${service.estimated_amount.toFixed(2)}`);
      }
    }

    return reasons;
  }

  /**
   * Recalculate service status and next payment date based on payment history
   * @param {string} userId - User ID
   * @param {string} serviceId - Service ID
   * @returns {Promise<Object>} Updated service data
   */
  async recalculateServiceStatus(userId, serviceId) {
    try {
      // Get service details
      const { data: service, error: serviceError } = await this.supabase
        .from('recurring_services')
        .select('*')
        .eq('id', serviceId)
        .eq('user_id', userId)
        .single();

      if (serviceError) throw serviceError;
      if (!service) throw new Error('Service not found');

      // Get all payments for this service, ordered by date DESC
      const { data: payments, error: paymentsError } = await this.supabase
        .from('service_payments')
        .select('*')
        .eq('service_id', serviceId)
        .eq('user_id', userId)
        .eq('is_predicted', false)
        .order('payment_date', { ascending: false });

      if (paymentsError) throw paymentsError;

      let updates = {};

      // If there are payments, calculate based on the most recent one
      if (payments && payments.length > 0) {
        const lastPayment = payments[0];
        updates.last_payment_date = lastPayment.payment_date;

        // Calculate next expected payment date
        const nextDate = this.calculateNextPaymentDate(
          lastPayment.payment_date,
          service.frequency,
          service.typical_day_of_month
        );
        updates.next_expected_date = nextDate;

        // Calculate status based on next_expected_date
        updates.status = this.calculateServiceStatus(nextDate);

      } else {
        // No payments yet - set to pending or keep current status
        updates.last_payment_date = null;
        updates.next_expected_date = service.next_expected_date; // Keep current estimate
        updates.status = 'active'; // Default to active
      }

      // Update the service
      const { data: updatedService, error: updateError } = await this.supabase
        .from('recurring_services')
        .update(updates)
        .eq('id', serviceId)
        .eq('user_id', userId)
        .select()
        .single();

      if (updateError) throw updateError;

      return {
        success: true,
        service: updatedService,
        updates
      };

    } catch (error) {
      console.error('Error recalculating service status:', error);
      throw error;
    }
  }

  /**
   * Calculate next payment date based on frequency
   * @param {string} lastDate - Last payment date (YYYY-MM-DD)
   * @param {string} frequency - Frequency (weekly, monthly, etc.)
   * @param {number} typicalDay - Typical day of month (optional)
   * @returns {string} Next payment date (YYYY-MM-DD)
   */
  calculateNextPaymentDate(lastDate, frequency, typicalDay = null) {
    const date = new Date(lastDate + 'T00:00:00');

    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'biweekly':
        date.setDate(date.getDate() + 14);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        if (typicalDay) {
          date.setDate(Math.min(typicalDay, this.getDaysInMonth(date.getFullYear(), date.getMonth())));
        }
        break;
      case 'bimonthly':
        date.setMonth(date.getMonth() + 2);
        if (typicalDay) {
          date.setDate(Math.min(typicalDay, this.getDaysInMonth(date.getFullYear(), date.getMonth())));
        }
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + 3);
        if (typicalDay) {
          date.setDate(Math.min(typicalDay, this.getDaysInMonth(date.getFullYear(), date.getMonth())));
        }
        break;
      case 'semiannual':
        date.setMonth(date.getMonth() + 6);
        if (typicalDay) {
          date.setDate(Math.min(typicalDay, this.getDaysInMonth(date.getFullYear(), date.getMonth())));
        }
        break;
      case 'annual':
        date.setFullYear(date.getFullYear() + 1);
        if (typicalDay) {
          date.setDate(Math.min(typicalDay, this.getDaysInMonth(date.getFullYear(), date.getMonth())));
        }
        break;
      default:
        // Default to monthly
        date.setMonth(date.getMonth() + 1);
    }

    return date.toISOString().split('T')[0];
  }

  /**
   * Get days in a specific month
   */
  getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  /**
   * Calculate service status based on next expected date
   * @param {string} nextExpectedDate - Next expected payment date (YYYY-MM-DD)
   * @returns {string} Status: 'up_to_date', 'due_soon', 'overdue', 'active'
   */
  calculateServiceStatus(nextExpectedDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nextDate = new Date(nextExpectedDate + 'T00:00:00');
    const diffDays = Math.floor((nextDate - today) / (1000 * 60 * 60 * 24));

    // Overdue: next payment < TODAY - 3 days
    if (diffDays < -3) {
      return 'overdue';
    }

    // Due soon: between TODAY and TODAY + 7 days
    if (diffDays >= 0 && diffDays <= 7) {
      return 'due_soon';
    }

    // Up to date: next payment > TODAY + 7 days
    if (diffDays > 7) {
      return 'up_to_date';
    }

    // Default
    return 'active';
  }

  /**
   * Recalculate all services for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Summary of recalculated services
   */
  async recalculateAllServices(userId) {
    try {
      // Get all services for this user
      const { data: services, error: servicesError } = await this.supabase
        .from('recurring_services')
        .select('id')
        .eq('user_id', userId)
        .neq('status', 'cancelled'); // Don't recalculate cancelled services

      if (servicesError) throw servicesError;

      const results = {
        total: services.length,
        updated: 0,
        errors: 0,
        details: []
      };

      // Recalculate each service
      for (const service of services) {
        try {
          await this.recalculateServiceStatus(userId, service.id);
          results.updated++;
          results.details.push({ id: service.id, success: true });
        } catch (error) {
          results.errors++;
          results.details.push({ id: service.id, success: false, error: error.message });
        }
      }

      return {
        success: true,
        results
      };

    } catch (error) {
      console.error('Error recalculating all services:', error);
      throw error;
    }
  }
}

module.exports = new RecurringServicesService();
