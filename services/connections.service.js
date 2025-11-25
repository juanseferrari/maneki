const { createClient } = require('@supabase/supabase-js');

/**
 * Connections Service
 * Manages OAuth connections in the database
 */
class ConnectionsService {
  constructor() {
    // Use service role key for backend operations to bypass RLS
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
  }

  /**
   * Create or update a connection
   * @param {string} userId - User ID
   * @param {string} provider - Provider name (e.g., 'mercadopago')
   * @param {Object} tokenData - Token data from OAuth
   * @returns {Promise<Object>}
   */
  async upsertConnection(userId, provider, tokenData) {
    try {
      const connectionData = {
        user_id: userId,
        provider: provider,
        provider_user_id: tokenData.user_id || tokenData.userId || null,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        token_type: tokenData.token_type || 'Bearer',
        expires_at: tokenData.expires_at || this.calculateExpiresAt(tokenData.expires_in),
        scope: tokenData.scope ? (Array.isArray(tokenData.scope) ? tokenData.scope : [tokenData.scope]) : null,
        metadata: tokenData.metadata || {},
        status: 'active',
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('connections')
        .upsert(connectionData, {
          onConflict: 'user_id,provider',
          returning: true
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Upsert connection error:', error);
      throw new Error(`Failed to save connection: ${error.message}`);
    }
  }

  /**
   * Get connection by user and provider
   * @param {string} userId - User ID
   * @param {string} provider - Provider name
   * @returns {Promise<Object|null>}
   */
  async getConnection(userId, provider) {
    try {
      const { data, error } = await this.supabase
        .from('connections')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', provider)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // No connection found
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Get connection error:', error);
      throw new Error(`Failed to get connection: ${error.message}`);
    }
  }

  /**
   * Get all connections for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  async getUserConnections(userId) {
    try {
      const { data, error } = await this.supabase
        .from('connections')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Get user connections error:', error);
      throw new Error(`Failed to get connections: ${error.message}`);
    }
  }

  /**
   * Update connection status
   * @param {string} connectionId - Connection ID
   * @param {string} status - New status
   * @returns {Promise<Object>}
   */
  async updateConnectionStatus(connectionId, status) {
    try {
      const { data, error } = await this.supabase
        .from('connections')
        .update({
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', connectionId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Update connection status error:', error);
      throw new Error(`Failed to update connection status: ${error.message}`);
    }
  }

  /**
   * Update connection tokens
   * @param {string} connectionId - Connection ID
   * @param {Object} tokenData - New token data
   * @returns {Promise<Object>}
   */
  async updateConnectionTokens(connectionId, tokenData) {
    try {
      const updateData = {
        access_token: tokenData.access_token,
        updated_at: new Date().toISOString()
      };

      if (tokenData.refresh_token) {
        updateData.refresh_token = tokenData.refresh_token;
      }

      if (tokenData.expires_in) {
        updateData.expires_at = this.calculateExpiresAt(tokenData.expires_in);
      }

      const { data, error } = await this.supabase
        .from('connections')
        .update(updateData)
        .eq('id', connectionId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Update connection tokens error:', error);
      throw new Error(`Failed to update tokens: ${error.message}`);
    }
  }

  /**
   * Delete a connection
   * @param {string} userId - User ID
   * @param {string} provider - Provider name
   * @returns {Promise<boolean>}
   */
  async deleteConnection(userId, provider) {
    try {
      const { error } = await this.supabase
        .from('connections')
        .delete()
        .eq('user_id', userId)
        .eq('provider', provider);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Delete connection error:', error);
      throw new Error(`Failed to delete connection: ${error.message}`);
    }
  }

  /**
   * Update last sync timestamp
   * @param {string} connectionId - Connection ID
   * @returns {Promise<Object>}
   */
  async updateLastSynced(connectionId) {
    try {
      const { data, error } = await this.supabase
        .from('connections')
        .update({
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', connectionId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Update last synced error:', error);
      throw new Error(`Failed to update last synced: ${error.message}`);
    }
  }

  /**
   * Create sync log
   * @param {string} connectionId - Connection ID
   * @param {string} userId - User ID
   * @param {Object} logData - Log data
   * @returns {Promise<Object>}
   */
  async createSyncLog(connectionId, userId, logData) {
    try {
      const { data, error } = await this.supabase
        .from('sync_logs')
        .insert({
          connection_id: connectionId,
          user_id: userId,
          sync_type: logData.sync_type || 'transactions',
          status: logData.status || 'success',
          records_synced: logData.records_synced || 0,
          error_message: logData.error_message || null,
          completed_at: logData.completed_at || new Date().toISOString(),
          metadata: logData.metadata || {}
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Create sync log error:', error);
      throw new Error(`Failed to create sync log: ${error.message}`);
    }
  }

  /**
   * Calculate expiration date from expires_in seconds
   * @param {number} expiresIn - Seconds until expiration
   * @returns {string|null}
   */
  calculateExpiresAt(expiresIn) {
    if (!expiresIn) return null;
    return new Date(Date.now() + expiresIn * 1000).toISOString();
  }
}

module.exports = new ConnectionsService();
