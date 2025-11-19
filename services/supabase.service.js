const { createClient } = require('@supabase/supabase-js');

class SupabaseService {
  constructor() {
    // Use service role key for backend operations to bypass RLS
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
    this.bucketName = process.env.SUPABASE_BUCKET_NAME || 'uploads';
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
  async saveTransactions(fileId, transactions, userId = null) {
    try {
      const transactionsData = transactions.map(t => ({
        file_id: fileId,
        user_id: userId,
        transaction_date: t.transaction_date,
        description: t.description,
        merchant: t.merchant,
        amount: t.amount,
        transaction_type: t.transaction_type,
        balance: t.balance || null,
        reference_number: t.reference_number,
        card_number: t.card_number || null,
        category: t.category || null,
        raw_data: t.raw_data,
        confidence_score: t.confidence_score
      }));

      const { data, error } = await this.supabase
        .from('transactions')
        .insert(transactionsData)
        .select();

      if (error) {
        throw error;
      }

      return data;
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
}

module.exports = new SupabaseService();
