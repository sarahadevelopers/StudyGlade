const crypto = require('crypto');

// Custom CSRF protection (double-submit cookie pattern)
// Token is stored in an httpOnly cookie, and must be echoed back in X-CSRF-Token header.

// Generate a random token and set it as a cookie
function generateToken(req, res) {
  const token = crypto.randomBytes(32).toString('hex');
  // Set cookie (httpOnly, sameSite, secure based on environment)
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('X-CSRF-Token', token, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });
  return token;
}

// Middleware to validate CSRF token for non-GET requests
function doubleCsrfProtection(req, res, next) {
  // Skip validation for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Get token from cookie and from header
  const cookieToken = req.cookies['X-CSRF-Token'];
  const headerToken = req.headers['x-csrf-token'];
  
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    console.error(`CSRF validation failed: cookie=${cookieToken ? 'present' : 'missing'}, header=${headerToken ? 'present' : 'missing'}`);
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  
  next();
}

module.exports = {
  generateToken,
  doubleCsrfProtection,
};