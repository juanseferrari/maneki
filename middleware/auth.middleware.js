/**
 * Authentication Middleware
 * Protects routes and ensures users are authenticated
 */

/**
 * Middleware to ensure user is authenticated
 * Redirects to login if not authenticated
 */
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  // Store the original URL they were trying to access
  req.session.returnTo = req.originalUrl;

  // Redirect to login page
  res.redirect('/login');
}

/**
 * Middleware to ensure user is NOT authenticated
 * Redirects to home if already logged in (for login/signup pages)
 */
function ensureGuest(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  next();
}

/**
 * Middleware to ensure user is an admin
 */
function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.is_admin) {
    return next();
  }

  res.status(403).json({
    success: false,
    error: 'Access denied. Admin privileges required.'
  });
}

/**
 * Middleware to attach user to locals for templates
 */
function attachUser(req, res, next) {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = req.isAuthenticated();
  next();
}

module.exports = {
  ensureAuthenticated,
  ensureGuest,
  ensureAdmin,
  attachUser
};
