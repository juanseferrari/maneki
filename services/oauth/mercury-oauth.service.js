const BaseOAuthService = require('./base-oauth.service');
const axios = require('axios');

/**
 * Mercury OAuth Service
 * Handles OAuth 2.0 flow for Mercury Bank
 *
 * Mercury uses a standard OAuth 2.0 flow with PKCE
 * Documentation: https://docs.mercury.com/reference/oauth
 *
 * Required scopes:
 * - accounts:read - Read account information
 * - transactions:read - Read transaction history
 */
class MercuryOAuthService extends BaseOAuthService {
  constructor() {
    super();
    this.clientId = process.env.MERCURY_CLIENT_ID;
    this.clientSecret = process.env.MERCURY_CLIENT_SECRET;
    this.authUrl = 'https://app.mercury.com/oauth/authorize';
    this.tokenUrl = 'https://api.mercury.com/api/v1/oauth/token';
    this.apiBaseUrl = 'https://api.mercury.com/api/v1';
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getProviderName() {
    return 'mercury';
  }

  /**
   * Get authorization URL for OAuth flow
   * @param {string} state - CSRF state token
   * @param {string} redirectUri - OAuth redirect URI
   * @returns {string}
   */
  getAuthorizationUrl(state, redirectUri) {
    const params = {
      client_id: this.clientId,
      response_type: 'code',
      state: state,
      redirect_uri: redirectUri,
      scope: 'accounts:read transactions:read'
    };

    return this.buildUrl(this.authUrl, params);
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code
   * @param {string} redirectUri - OAuth redirect URI
   * @returns {Promise<Object>} Token response
   */
  async exchangeCodeForToken(code, redirectUri) {
    try {
      const response = await axios.post(this.tokenUrl, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || null,
        token_type: response.data.token_type || 'Bearer',
        expires_in: response.data.expires_in,
        scope: response.data.scope
      };
    } catch (error) {
      console.error('Mercury token exchange error:', error.response?.data || error.message);
      throw new Error(`Failed to exchange code for token: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} Token response
   */
  async refreshAccessToken(refreshToken) {
    try {
      const response = await axios.post(this.tokenUrl, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || refreshToken,
        token_type: response.data.token_type || 'Bearer',
        expires_in: response.data.expires_in,
        scope: response.data.scope
      };
    } catch (error) {
      console.error('Mercury token refresh error:', error.response?.data || error.message);
      throw new Error(`Failed to refresh token: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Revoke access token
   * @param {string} accessToken - Access token to revoke
   * @returns {Promise<boolean>}
   */
  async revokeToken(accessToken) {
    try {
      await axios.post(`${this.apiBaseUrl}/oauth/revoke`, {
        token: accessToken
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return true;
    } catch (error) {
      console.error('Mercury token revoke error:', error.response?.data || error.message);
      // Return true anyway - token might already be revoked
      return true;
    }
  }

  /**
   * Get user/account info from Mercury
   * @param {string} accessToken - Access token
   * @returns {Promise<Object>} Account info
   */
  async getUserInfo(accessToken) {
    try {
      // Mercury doesn't have a /users/me endpoint
      // Instead, we get the accounts list and use the first account's info
      const accounts = await this.getAccounts(accessToken);

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      // Return aggregated info from accounts
      return {
        id: accounts[0].id,
        accounts: accounts.map(acc => ({
          id: acc.id,
          name: acc.name,
          type: acc.type,
          status: acc.status,
          currentBalance: acc.currentBalance,
          availableBalance: acc.availableBalance,
          routingNumber: acc.routingNumber,
          accountNumber: acc.accountNumber
        })),
        primary_account_id: accounts[0].id,
        company_name: accounts[0].legalBusinessName || accounts[0].name
      };
    } catch (error) {
      console.error('Mercury user info error:', error.response?.data || error.message);
      throw new Error(`Failed to get user info: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get all accounts
   * @param {string} accessToken - Access token
   * @returns {Promise<Array>} List of accounts
   */
  async getAccounts(accessToken) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/accounts`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      return response.data.accounts || [];
    } catch (error) {
      console.error('Mercury get accounts error:', error.response?.data || error.message);
      throw new Error(`Failed to get accounts: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get transactions for an account
   * @param {string} accessToken - Access token
   * @param {string} accountId - Account ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of transactions
   */
  async getTransactions(accessToken, accountId, options = {}) {
    try {
      const {
        start,
        end,
        limit = 500,
        offset = 0
      } = options;

      const params = {
        limit,
        offset
      };

      if (start) params.start = start;
      if (end) params.end = end;

      const response = await axios.get(`${this.apiBaseUrl}/account/${accountId}/transactions`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        params
      });

      return response.data.transactions || [];
    } catch (error) {
      console.error('Mercury get transactions error:', error.response?.data || error.message);
      throw new Error(`Failed to get transactions: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Test if credentials are valid
   * @param {string} accessToken - Access token
   * @returns {Promise<boolean>}
   */
  async testConnection(accessToken) {
    try {
      await this.getAccounts(accessToken);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new MercuryOAuthService();
