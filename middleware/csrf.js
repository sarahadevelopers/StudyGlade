const crypto = require('crypto');

// Generate a random token and set it as an httpOnly cookie
function generateToken(req, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('X-CSRF-Token', token, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',               // explicitly set path
  });
  console.log(`✅ CSRF token generated for ${req.method} ${req.path}: ${token.substring(0,10)}...`);
  return token;
}

// Middleware to validate token for non‑GET requests
function doubleCsrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  
  const cookieToken = req.cookies['X-CSRF-Token'];
  const headerToken = req.headers['x-csrf-token'];
  
  console.log(`🔍 CSRF validation for ${req.method} ${req.path}`);
  console.log(`   Cookie token: ${cookieToken ? cookieToken.substring(0,10)+'...' : 'MISSING'}`);
  console.log(`   Header token: ${headerToken ? headerToken.substring(0,10)+'...' : 'MISSING'}`);
  
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    console.error(`❌ CSRF FAIL: cookie="${cookieToken}", header="${headerToken}"`);
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

module.exports = { generateToken, doubleCsrfProtection };