const BaseOAuthService = require('./base-oauth.service');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const jwa = require('jwa'); // You'll need to install this: npm install jwa

/**
 * Enable Banking OAuth Service
 * Handles OAuth 2.0 flow for European banks through Enable Banking API
 */
class EuBanksOAuthService extends BaseOAuthService {
  constructor() {
    super();

    // Configuration from environment variables
    this.applicationId = process.env.EUBANKS_APP_ID;
    this.privateKeyPath = process.env.EUBANKS_PRIVATE_KEY_PATH;
    this.environment = process.env.EUBANKS_ENV || 'production'; // 'production' or 'sandbox'

    // API endpoints
    this.apiBaseUrl = 'https://api.enablebanking.com';

    // Default settings
    this.defaultCountry = 'FI'; // Finland by default
    this.defaultAccess = {
      valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
      max_historical_days: 90,
      accounts: ['balances', 'details', 'transactions']
    };

    // Load private key from environment variable or file path
    this.privateKey = null;

    // First try to load from EUBANKS_PRIVATE_KEY environment variable
    if (process.env.EUBANKS_PRIVATE_KEY) {
      // Replace literal \n with actual newlines (for Heroku env vars)
      this.privateKey = process.env.EUBANKS_PRIVATE_KEY.replace(/\\n/g, '\n');
      console.log('🔑 Loaded private key from EUBANKS_PRIVATE_KEY environment variable');
    }
    // Fallback to reading from file path (for local development)
    else if (this.privateKeyPath && fs.existsSync(this.privateKeyPath)) {
      this.privateKey = fs.readFileSync(this.privateKeyPath, 'utf8');
      console.log('🔑 Loaded private key from file:', this.privateKeyPath);
    } else {
      console.warn('⚠️  No private key configured. Set EUBANKS_PRIVATE_KEY or EUBANKS_PRIVATE_KEY_PATH');
    }
  }

  getProviderName() {
    return 'eubanks';
  }

  /**
   * Generate JWT token for API authentication
   * Based on your reference code
   */
  generateJWT(expiresIn = 3600) {
    if (!this.privateKey) {
      throw new Error('Private key not loaded. Please configure EUBANKS_PRIVATE_KEY_PATH');
    }

    const jsonBase64 = (data) => {
      return Buffer.from(JSON.stringify(data))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    };

    const iat = Math.floor(Date.now() / 1000);

    const header = jsonBase64({
      typ: 'JWT',
      alg: 'RS256',
      kid: this.applicationId
    });

    const body = jsonBase64({
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat: iat,
      exp: iat + expiresIn
    });

    const signature = jwa('RS256').sign(`${header}.${body}`, this.privateKey);

    return `${header}.${body}.${signature}`;
  }

  /**
   * Get authorization headers with JWT
   */
  getAuthHeaders() {
    const jwt = this.generateJWT();
    return {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Get list of available banks (ASPSPs)
   */
  async getAvailableBanks(country = null) {
    try {
      const countryParam = country || this.defaultCountry;
      const response = await axios.get(
        `${this.apiBaseUrl}/aspsps?country=${countryParam}`,
        { headers: this.getAuthHeaders() }
      );

      console.log('Enable Banking API response:', JSON.stringify(response.data, null, 2));

      // The API returns an object with aspsps array
      // Extract the array of banks
      const banks = response.data.aspsps || response.data;

      // Transform to match our expected format if needed
      if (Array.isArray(banks)) {
        return banks.map(bank => ({
          name: bank.name,
          country: bank.country,
          logo: bank.logo,
          bic: bank.bic
        }));
      }

      return response.data;
    } catch (error) {
      console.error('Error fetching available banks:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Initiate OAuth authorization
   * This creates a session and returns the authorization URL
   */
  async initiateAuthorization(options = {}) {
    try {
      console.log('🏦 [SERVICE] ========== INITIATE AUTHORIZATION ==========');
      console.log('🏦 [SERVICE] Options received:', options);

      const {
        aspspName,
        aspspCountry = this.defaultCountry,
        redirectUri,
        state,
        psuType = 'personal' // 'personal' or 'business'
      } = options;

      console.log('🏦 [SERVICE] Extracted values:');
      console.log('🏦 [SERVICE] - aspspName:', aspspName);
      console.log('🏦 [SERVICE] - aspspCountry:', aspspCountry);
      console.log('🏦 [SERVICE] - redirectUri:', redirectUri);
      console.log('🏦 [SERVICE] - state:', state);
      console.log('🏦 [SERVICE] - psuType:', psuType);

      const authPayload = {
        access: this.defaultAccess,
        aspsp: {
          name: aspspName,
          country: aspspCountry
        },
        state: state,
        redirect_url: redirectUri,
        psu_type: psuType
      };

      console.log('🏦 [SERVICE] Auth payload to send:', JSON.stringify(authPayload, null, 2));
      console.log('🏦 [SERVICE] API URL:', `${this.apiBaseUrl}/auth`);

      const response = await axios.post(
        `${this.apiBaseUrl}/auth`,
        authPayload,
        { headers: this.getAuthHeaders() }
      );

      console.log('🏦 [SERVICE] ✅ Response received from Enable Banking');
      console.log('🏦 [SERVICE] Response data:', response.data);

      return {
        authUrl: response.data.url,
        sessionId: response.data.session_id
      };
    } catch (error) {
      console.error('🏦 [SERVICE] ❌ Error initiating authorization:', error.response?.data || error.message);
      console.error('🏦 [SERVICE] Full error:', error);
      throw error;
    }
  }

  /**
   * Standard OAuth method - Get authorization URL
   * Note: For Enable Banking, we need to know which bank first
   */
  getAuthorizationUrl(state, redirectUri, bankName = null, country = null) {
    // For Enable Banking, we'll return a placeholder
    // The actual auth URL is generated in initiateAuthorization()
    // This will be handled differently in the route
    return null;
  }

  /**
   * Complete the authorization by exchanging the code for session
   */
  async exchangeCodeForToken(code, redirectUri) {
    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/sessions`,
        { code: code },
        { headers: this.getAuthHeaders() }
      );

      const sessionData = response.data;

      return {
        access_token: sessionData.session_id, // We'll use session_id as access_token
        session_id: sessionData.session_id,
        accounts: sessionData.accounts || [],
        aspsp: sessionData.aspsp,
        valid_until: sessionData.access?.valid_until,
        psu_type: sessionData.psu_type,
        user_id: sessionData.session_id // Use session_id as user identifier
      };
    } catch (error) {
      console.error('Error exchanging code for session:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Refresh access token (sessions in Enable Banking)
   * Enable Banking sessions are long-lived, but we may need to refresh
   */
  async refreshAccessToken(sessionId) {
    try {
      // Get session info to check if still valid
      const response = await axios.get(
        `${this.apiBaseUrl}/sessions/${sessionId}`,
        { headers: this.getAuthHeaders() }
      );

      return {
        access_token: sessionId,
        session_id: sessionId,
        accounts: response.data.accounts || [],
        valid_until: response.data.access?.valid_until
      };
    } catch (error) {
      console.error('Error refreshing session:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Revoke access token (delete session)
   */
  async revokeToken(sessionId) {
    try {
      await axios.delete(
        `${this.apiBaseUrl}/sessions/${sessionId}`,
        { headers: this.getAuthHeaders() }
      );
      return true;
    } catch (error) {
      console.error('Error revoking session:', error.response?.data || error.message);
      // Don't throw, just log - session might already be expired
      return false;
    }
  }

  /**
   * Get user info (session info and accounts)
   */
  async getUserInfo(sessionId) {
    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/sessions/${sessionId}`,
        { headers: this.getAuthHeaders() }
      );

      const sessionData = response.data;

      return {
        id: sessionData.session_id,
        aspsp: sessionData.aspsp,
        psu_type: sessionData.psu_type,
        accounts: sessionData.accounts || [],
        valid_until: sessionData.access?.valid_until
      };
    } catch (error) {
      console.error('Error getting user info:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new EuBanksOAuthService();
