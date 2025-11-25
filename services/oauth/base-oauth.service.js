/**
 * Base OAuth Service
 * Abstract class for OAuth 2.0 providers
 */
class BaseOAuthService {
  constructor() {
    if (this.constructor === BaseOAuthService) {
      throw new Error('BaseOAuthService is an abstract class and cannot be instantiated directly');
    }
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getProviderName() {
    throw new Error('getProviderName() must be implemented');
  }

  /**
   * Get authorization URL
   * @param {string} state - CSRF state token
   * @param {string} redirectUri - OAuth redirect URI
   * @returns {string}
   */
  getAuthorizationUrl(state, redirectUri) {
    throw new Error('getAuthorizationUrl() must be implemented');
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code
   * @param {string} redirectUri - OAuth redirect URI
   * @returns {Promise<Object>} Token response
   */
  async exchangeCodeForToken(code, redirectUri) {
    throw new Error('exchangeCodeForToken() must be implemented');
  }

  /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} Token response
   */
  async refreshAccessToken(refreshToken) {
    throw new Error('refreshAccessToken() must be implemented');
  }

  /**
   * Revoke access token
   * @param {string} accessToken - Access token to revoke
   * @returns {Promise<boolean>}
   */
  async revokeToken(accessToken) {
    throw new Error('revokeToken() must be implemented');
  }

  /**
   * Get user info from provider
   * @param {string} accessToken - Access token
   * @returns {Promise<Object>} User info
   */
  async getUserInfo(accessToken) {
    throw new Error('getUserInfo() must be implemented');
  }

  /**
   * Validate token expiration
   * @param {Date} expiresAt - Token expiration date
   * @returns {boolean}
   */
  isTokenExpired(expiresAt) {
    if (!expiresAt) return false;
    return new Date() >= new Date(expiresAt);
  }

  /**
   * Calculate token expiration date
   * @param {number} expiresIn - Seconds until expiration
   * @returns {Date}
   */
  calculateExpiresAt(expiresIn) {
    if (!expiresIn) return null;
    return new Date(Date.now() + expiresIn * 1000);
  }

  /**
   * Build URL with query parameters
   * @param {string} baseUrl - Base URL
   * @param {Object} params - Query parameters
   * @returns {string}
   */
  buildUrl(baseUrl, params) {
    const url = new URL(baseUrl);
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined) {
        url.searchParams.append(key, params[key]);
      }
    });
    return url.toString();
  }
}

module.exports = BaseOAuthService;
