const BaseOAuthService = require('./base-oauth.service');
const axios = require('axios');

/**
 * Mercado Pago OAuth Service
 * Handles OAuth 2.0 flow for Mercado Pago
 * Documentation: https://www.mercadopago.com.ar/developers/es/docs/security/oauth
 */
class MercadoPagoOAuthService extends BaseOAuthService {
  constructor() {
    super();
    this.clientId = process.env.MERCADOPAGO_CLIENT_ID;
    this.clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET;
    this.authUrl = 'https://auth.mercadopago.com/authorization';
    this.tokenUrl = 'https://api.mercadopago.com/oauth/token';
    this.apiBaseUrl = 'https://api.mercadopago.com';
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getProviderName() {
    return 'mercadopago';
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
      platform_id: 'mp',
      state: state,
      redirect_uri: redirectUri
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
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        token_type: response.data.token_type || 'Bearer',
        expires_in: response.data.expires_in,
        scope: response.data.scope,
        user_id: response.data.user_id,
        public_key: response.data.public_key,
        live_mode: response.data.live_mode
      };
    } catch (error) {
      console.error('Mercado Pago token exchange error:', error.response?.data || error.message);
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
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        token_type: response.data.token_type || 'Bearer',
        expires_in: response.data.expires_in,
        scope: response.data.scope
      };
    } catch (error) {
      console.error('Mercado Pago token refresh error:', error.response?.data || error.message);
      throw new Error(`Failed to refresh token: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Revoke access token
   * @param {string} accessToken - Access token to revoke
   * @returns {Promise<boolean>}
   */
  async revokeToken(accessToken) {
    // Mercado Pago doesn't have a specific revoke endpoint
    // The token will expire naturally or can be invalidated by changing credentials
    return true;
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

      return {
        id: response.data.id,
        email: response.data.email,
        first_name: response.data.first_name,
        last_name: response.data.last_name,
        nickname: response.data.nickname,
        country_id: response.data.country_id,
        site_id: response.data.site_id
      };
    } catch (error) {
      console.error('Mercado Pago user info error:', error.response?.data || error.message);
      throw new Error(`Failed to get user info: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Test if credentials are valid
   * @param {string} accessToken - Access token
   * @returns {Promise<boolean>}
   */
  async testConnection(accessToken) {
    try {
      await this.getUserInfo(accessToken);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new MercadoPagoOAuthService();
