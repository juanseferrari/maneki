const { createClient } = require('@supabase/supabase-js');
const categorizationService = require('./categorization.service');
const ExchangeRateService = require('./exchange-rate.service');

class SupabaseService {
  constructor() {
    // Use service role key for backend operations to bypass RLS
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
    this.bucketName = process.env.SUPABASE_BUCKET_NAME || 'uploads';
    this.exchangeRateService = new ExchangeRateService(this.supabase);
  }

  /**
   * Upload a file to Supabase Storage
   * @param {Buffer} fileBuffer - The file buffer
   * @param {string} fileName - The name to save the file as
   * @param {string} contentType - The MIME type of the file
   * @returns {Promise<Object>} Upload result with file path and public URL
   */
  async uploadFile(fileBuffer, fileName, contentType) {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(fileName, fileBuffer, {
          contentType,
          upsert: false
        });

      if (error) {
        throw error;
      }

      // Get public URL for the file
      const { data: urlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(fileName);

      return {
        success: true,
        path: data.path,
        publicUrl: urlData.publicUrl
      };
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * List all files in the bucket
   * @returns {Promise<Array>} List of files
   */
  async listFiles() {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .list('', {
          limit: 100,
          offset: 0,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
        throw error;
      }

      // Add public URLs to each file
      const filesWithUrls = data.map(file => {
        const { data: urlData } = this.supabase.storage
          .from(this.bucketName)
          .getPublicUrl(file.name);

        return {
          ...file,
          publicUrl: urlData.publicUrl
        };
      });

      return filesWithUrls;
    } catch (error) {
      console.error('List files error:', error);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Delete a file from storage
   * @param {string} fileName - The name of the file to delete
   * @returns {Promise<Object>} Delete result
   */
  async deleteFile(fileName) {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([fileName]);

      if (error) {
        throw error;
      }

      return {
        success: true,
        message: 'File deleted successfully'
      };
    } catch (error) {
      console.error('Delete error:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Create file metadata record in database
   * @param {Object} fileData - File metadata
   * @returns {Promise<Object>} Created file record
   */
  async createFileRecord(fileData) {
    try {
      const { data, error } = await this.supabase
        .from('files')
        .insert({
          original_name: fileData.originalName,
          stored_name: fileData.storedName,
          file_size: fileData.size,
          mime_type: fileData.mimeType,
          storage_path: fileData.path,
          public_url: fileData.publicUrl,
          processing_status: 'pending',
          user_id: fileData.userId || null
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Create file record error:', error);
      throw new Error(`Failed to create file record: ${error.message}`);
    }
  }

  /**
   * Update file processing status
   * @param {string} fileId - File ID
   * @param {string} status - Processing status
   * @param {string} errorMessage - Optional error message
   * @returns {Promise<Object>}
   */
  async updateFileStatus(fileId, status, errorMessage = null) {
    try {
      const updateData = {
        processing_status: status,
        processing_started_at: status === 'processing' ? new Date().toISOString() : undefined
      };

      if (errorMessage) {
        updateData.processing_error = errorMessage;
      }

      const { data, error } = await this.supabase
        .from('files')
        .update(updateData)
        .eq('id', fileId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Update file status error:', error);
      throw new Error(`Failed to update file status: ${error.message}`);
    }
  }

  /**
   * Update file processing metadata
   * @param {string} fileId - File ID
   * @param {Object} metadata - Metadata to update
   * @returns {Promise<Object>}
   */
  async updateFileProcessing(fileId, metadata) {
    try {
      const { data, error } = await this.supabase
        .from('files')
        .update(metadata)
        .eq('id', fileId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Update file processing error:', error);
      throw new Error(`Failed to update file processing: ${error.message}`);
    }
  }

  /**
   * Save transactions to database
   * @param {string} fileId - File ID
   * @param {Array<Object>} transactions - Array of transactions
   * @param {string} userId - User ID (optional)
   * @returns {Promise<Array>}
   */
  async saveTransactions(fileId, transactions, userId = null, bankName = null) {
    try {
      // Step 1: Collect all reference_numbers that are not null/empty
      const referenceNumbers = transactions
        .map(t => t.reference_number)
        .filter(ref => ref && ref.trim() !== '');

      let existingReferenceNumbers = new Set();
      let duplicateCount = 0;

      // Step 2: If there are reference numbers, check for duplicates in DB
      if (referenceNumbers.length > 0 && userId) {
        console.log(`[Supabase] Checking for duplicate reference numbers (${referenceNumbers.length} to check)...`);

        const { data: existingTransactions, error: checkError } = await this.supabase
          .from('transactions')
          .select('reference_number')
          .eq('user_id', userId)
          .in('reference_number', referenceNumbers);

        if (checkError) {
          console.warn('[Supabase] Error checking duplicates, proceeding without validation:', checkError);
        } else if (existingTransactions && existingTransactions.length > 0) {
          existingReferenceNumbers = new Set(existingTransactions.map(t => t.reference_number));
          duplicateCount = existingReferenceNumbers.size;
          console.log(`[Supabase] Found ${duplicateCount} duplicate reference numbers`);
        }
      }

      // Step 3: Filter out transactions with duplicate reference_numbers
      const transactionsToInsert = transactions.filter(t => {
        // If transaction has no reference_number, always include it
        if (!t.reference_number || t.reference_number.trim() === '') {
          return true;
        }
        // If reference_number exists in DB, exclude it
        if (existingReferenceNumbers.has(t.reference_number)) {
          return false;
        }
        return true;
      });

      const skippedCount = transactions.length - transactionsToInsert.length;
      console.log(`[Supabase] Inserting ${transactionsToInsert.length} transactions (${skippedCount} duplicates skipped)`);

      // Step 4: If no transactions to insert, return early with stats
      if (transactionsToInsert.length === 0) {
        return {
          inserted: [],
          duplicatesSkipped: skippedCount,
          totalProcessed: transactions.length
        };
      }

      // Step 4.5: Auto-categorize transactions (if userId provided)
      let categorizedTransactions = transactionsToInsert;
      if (userId) {
        console.log(`[Supabase] Auto-categorizing ${transactionsToInsert.length} transactions...`);
        categorizedTransactions = await categorizationService.autoCategorizeTransactions(
          transactionsToInsert,
          userId
        );
      }

      // Step 4.75: Convert transactions to USD
      console.log(`[Supabase] Converting ${categorizedTransactions.length} transactions to USD...`);
      const transactionsWithUSD = await Promise.all(
        categorizedTransactions.map(async (t) => {
          // Get currency from transaction, default to ARS
          const currency = t.currency || 'ARS';

          // Try to convert to USD
          const conversion = await this.exchangeRateService.convertToUSD(
            t.amount,
            currency,
            t.transaction_date
          );

          // Add conversion data if successful, otherwise leave null
          return {
            ...t,
            amount_usd: conversion ? conversion.amountUsd : null,
            exchange_rate: conversion ? conversion.exchangeRate : null,
            exchange_rate_date: conversion ? conversion.exchangeRateDate : null
          };
        })
      );

      const convertedCount = transactionsWithUSD.filter(t => t.amount_usd !== null).length;
      console.log(`[Supabase] Successfully converted ${convertedCount}/${transactionsWithUSD.length} transactions to USD`);

      // Step 5: Prepare data for insertion
      const transactionsData = transactionsWithUSD.map(t => ({
        file_id: fileId,
        user_id: userId,
        transaction_date: t.transaction_date,
        transaction_datetime: t.transaction_datetime || (t.transaction_date ? new Date(t.transaction_date + 'T12:00:00Z').toISOString() : null),
        description: t.description,
        merchant: t.merchant,
        amount: t.amount,
        currency: t.currency || 'ARS',  // Store original currency
        amount_usd: t.amount_usd,
        exchange_rate: t.exchange_rate,
        exchange_rate_date: t.exchange_rate_date,
        transaction_type: t.transaction_type,
        balance: t.balance || null,
        reference_number: t.reference_number,
        card_number: t.card_number || null,
        category: t.category || null,
        category_id: t.category_id || null,  // Auto-categorization result
        cuit: t.cuit || null,
        razon_social: t.razon_social || null,
        bank_name: bankName || t.bank_name || null,
        raw_data: t.raw_data,
        confidence_score: t.confidence_score
      }));

      // Step 6: Insert non-duplicate transactions
      const { data, error } = await this.supabase
        .from('transactions')
        .insert(transactionsData)
        .select();

      if (error) {
        throw error;
      }

      // Step 7: Return inserted data with duplicate stats
      return {
        inserted: data,
        duplicatesSkipped: skippedCount,
        totalProcessed: transactions.length
      };
    } catch (error) {
      console.error('Save transactions error:', error);
      throw new Error(`Failed to save transactions: ${error.message}`);
    }
  }

  /**
   * Get all files with their metadata
   * @param {string} userId - Optional user ID filter
   * @returns {Promise<Array>}
   */
  async getFiles(userId = null) {
    try {
      let query = this.supabase
        .from('files')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Get files error:', error);
      throw new Error(`Failed to get files: ${error.message}`);
    }
  }

  /**
   * Get transactions for a file
   * @param {string} fileId - File ID
   * @returns {Promise<Array>}
   */
  async getTransactionsByFile(fileId, userId = null) {
    try {
      let query = this.supabase
        .from('transactions')
        .select('*')
        .eq('file_id', fileId)
        .order('transaction_date', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Get transactions error:', error);
      throw new Error(`Failed to get transactions: ${error.message}`);
    }
  }

  /**
   * Get all transactions for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  async getAllTransactions(userId = null) {
    try {
      let query = this.supabase
        .from('transactions')
        .select(`
          *,
          files:file_id (
            original_name,
            bank_name,
            statement_date
          )
        `)
        .order('transaction_date', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Get all transactions error:', error);
      throw new Error(`Failed to get all transactions: ${error.message}`);
    }
  }

  /**
   * ========================================
   * VEP (Volante Electrónico de Pago) Methods
   * ========================================
   */

  /**
   * Save VEP data to database
   * @param {string} fileId - File ID
   * @param {Object} vepData - VEP data object
   * @param {string} userId - User ID (optional)
   * @returns {Promise<Object>}
   */
  async saveVep(fileId, vepData, userId = null) {
    try {
      const { data, error } = await this.supabase
        .from('veps')
        .insert({
          file_id: fileId,
          user_id: userId,
          nro_vep: vepData.nro_vep,
          organismo_recaudador: vepData.organismo_recaudador,
          tipo_pago: vepData.tipo_pago,
          descripcion_reducida: vepData.descripcion_reducida,
          cuit: vepData.cuit,
          concepto: vepData.concepto,
          subconcepto: vepData.subconcepto,
          periodo: vepData.periodo,
          generado_por_usuario: vepData.generado_por_usuario,
          fecha_generacion: vepData.fecha_generacion,
          dia_expiracion: vepData.dia_expiracion,
          importe_total_pagar: vepData.importe_total_pagar,
          items_detalle: vepData.items_detalle || [],
          confidence_score: vepData.confidence_score,
          raw_data: vepData.raw_data
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Save VEP error:', error);
      throw new Error(`Failed to save VEP: ${error.message}`);
    }
  }

  /**
   * Get all VEPs with their metadata
   * @param {string} userId - Optional user ID filter
   * @returns {Promise<Array>}
   */
  async getVeps(userId = null) {
    try {
      let query = this.supabase
        .from('veps')
        .select(`
          *,
          files:file_id (
            original_name,
            created_at,
            public_url
          )
        `)
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Get VEPs error:', error);
      throw new Error(`Failed to get VEPs: ${error.message}`);
    }
  }

  /**
   * Get VEP by file ID
   * @param {string} fileId - File ID
   * @returns {Promise<Object|null>}
   */
  async getVepByFile(fileId, userId = null) {
    try {
      let query = this.supabase
        .from('veps')
        .select(`
          *,
          files:file_id (
            original_name,
            created_at,
            public_url
          )
        `)
        .eq('file_id', fileId);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Get VEP by file error:', error);
      throw new Error(`Failed to get VEP: ${error.message}`);
    }
  }

  /**
   * Get VEP by VEP number
   * @param {string} nroVep - VEP number
   * @param {string} userId - User ID (optional, for security)
   * @returns {Promise<Object|null>}
   */
  async getVepByNumber(nroVep, userId = null) {
    try {
      let query = this.supabase
        .from('veps')
        .select(`
          *,
          files:file_id (
            original_name,
            created_at,
            public_url
          )
        `)
        .eq('nro_vep', nroVep);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Get VEP by number error:', error);
      throw new Error(`Failed to get VEP: ${error.message}`);
    }
  }

  /**
   * Update file document type
   * @param {string} fileId - File ID
   * @param {string} documentType - Document type ('bank_statement' or 'vep')
   * @returns {Promise<Object>}
   */
  async updateFileDocumentType(fileId, documentType) {
    try {
      const { data, error } = await this.supabase
        .from('files')
        .update({ document_type: documentType })
        .eq('id', fileId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Update file document type error:', error);
      throw new Error(`Failed to update file document type: ${error.message}`);
    }
  }

  /**
   * Get file by ID
   * @param {string} fileId - File ID
   * @param {string} userId - User ID (optional)
   * @returns {Promise<Object|null>}
   */
  async getFileById(fileId, userId = null) {
    try {
      let query = this.supabase
        .from('files')
        .select('*')
        .eq('id', fileId);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Get file by ID error:', error);
      throw new Error(`Failed to get file: ${error.message}`);
    }
  }

  /**
   * Get transaction by ID
   * @param {string} transactionId - Transaction ID
   * @param {string} userId - User ID (optional)
   * @returns {Promise<Object|null>}
   */
  async getTransactionById(transactionId, userId = null) {
    try {
      let query = this.supabase
        .from('transactions')
        .select(`
          *,
          files:file_id (
            id,
            original_name,
            created_at,
            storage_path
          )
        `)
        .eq('id', transactionId);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Get transaction by ID error:', error);
      throw new Error(`Failed to get transaction: ${error.message}`);
    }
  }

  /**
   * Update transaction notes
   * @param {string} transactionId - Transaction ID
   * @param {string} notes - Notes text
   * @param {string} userId - User ID (optional, for security)
   * @returns {Promise<Object>}
   */
  async updateTransactionNotes(transactionId, notes, userId = null) {
    try {
      let query = this.supabase
        .from('transactions')
        .update({ notes })
        .eq('id', transactionId);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query.select().single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Update transaction notes error:', error);
      throw new Error(`Failed to update transaction notes: ${error.message}`);
    }
  }

  /**
   * Update transaction category
   * @param {string} transactionId - Transaction ID
   * @param {string} category - Category ID
   * @param {string} userId - User ID (optional, for security)
   * @returns {Promise<Object>}
   */
  async updateTransactionCategory(transactionId, category, userId = null) {
    try {
      let query = this.supabase
        .from('transactions')
        .update({ category_id: category })
        .eq('id', transactionId);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query.select().single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Update transaction category error:', error);
      throw new Error(`Failed to update transaction category: ${error.message}`);
    }
  }

  /**
   * Get user's categories for Claude smart categorization
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  async getUserCategories(userId) {
    try {
      const { data, error } = await this.supabase
        .from('categories')
        .select('id, name, keywords')
        .eq('user_id', userId)
        .order('name');

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Get user categories error:', error);
      throw new Error(`Failed to get user categories: ${error.message}`);
    }
  }

  /**
   * Save installment data for transactions with cuotas
   * @param {Array} transactions - Transactions with installment_data
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async saveInstallments(transactions, userId) {
    try {
      // Filter transactions that have installment data
      const installmentsData = [];

      for (const tx of transactions) {
        if (tx.installment_data && tx.id) {
          installmentsData.push({
            transaction_id: tx.id,
            user_id: userId,
            installment_number: tx.installment_data.installment_number,
            total_installments: tx.installment_data.total_installments,
            group_id: tx.installment_data.group_id
          });
        }
      }

      if (installmentsData.length === 0) {
        console.log('[Supabase] No installments to save');
        return { success: true, inserted: [] };
      }

      // Insert all installments
      const { data, error } = await this.supabase
        .from('installments')
        .insert(installmentsData)
        .select();

      if (error) {
        throw error;
      }

      console.log(`[Supabase] Saved ${data.length} installment records`);

      return {
        success: true,
        inserted: data
      };
    } catch (error) {
      console.error('Save installments error:', error);
      throw new Error(`Failed to save installments: ${error.message}`);
    }
  }

  /**
   * Get transactions for review (for preview modal)
   * @param {string} fileId - File ID
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  async getFileTransactionsForReview(fileId, userId) {
    try {
      const { data, error } = await this.supabase
        .rpc('get_file_transactions_for_review', {
          p_file_id: fileId,
          p_user_id: userId
        });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Get file transactions for review error:', error);
      throw new Error(`Failed to get transactions for review: ${error.message}`);
    }
  }

  /**
   * Confirm reviewed transactions (mark as not needing review)
   * @param {Array} transactions - Array of transaction updates
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async confirmReviewedTransactions(transactions, userId) {
    try {
      const updates = [];

      for (const tx of transactions) {
        const updateData = {
          needs_review: false
        };

        // Update fields if provided
        if (tx.description !== undefined) updateData.description = tx.description;
        if (tx.amount !== undefined) updateData.amount = tx.amount;
        if (tx.date !== undefined) updateData.date = tx.date;
        if (tx.category_id !== undefined) updateData.category_id = tx.category_id;

        const { data, error } = await this.supabase
          .from('transactions')
          .update(updateData)
          .eq('id', tx.id)
          .eq('user_id', userId)
          .select()
          .single();

        if (error) {
          console.error(`Failed to update transaction ${tx.id}:`, error);
          continue; // Continue with other transactions
        }

        updates.push(data);
      }

      return {
        success: true,
        updated: updates,
        count: updates.length
      };
    } catch (error) {
      console.error('Confirm reviewed transactions error:', error);
      throw new Error(`Failed to confirm transactions: ${error.message}`);
    }
  }

  /**
   * Delete transaction (for removing from preview)
   * @param {string} transactionId - Transaction ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async deleteTransaction(transactionId, userId) {
    try {
      const { error } = await this.supabase
        .from('transactions')
        .delete()
        .eq('id', transactionId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('Delete transaction error:', error);
      throw new Error(`Failed to delete transaction: ${error.message}`);
    }
  }
}

module.exports = new SupabaseService();
