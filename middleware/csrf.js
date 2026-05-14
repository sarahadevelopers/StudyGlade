const { doubleCsrf } = require('csrf-csrf');

// Log the imported doubleCsrf to verify it's a function
console.log('doubleCsrf type:', typeof doubleCsrf);

const options = {
  getSecret: () => {
    const secret = process.env.CSRF_SECRET || 'default-secret-change-in-production';
    console.log('CSRF secret length:', secret.length);
    return secret;
  },
  cookieName: 'X-CSRF-Token',
  cookieOptions: {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
};

let generateToken, doubleCsrfProtection;

try {
  const csrf = doubleCsrf(options);
  generateToken = csrf.generateToken;
  doubleCsrfProtection = csrf.doubleCsrfProtection;
  console.log('✅ CSRF middleware initialized successfully');
} catch (err) {
  console.error('❌ CSRF initialization failed:', err);
  // Provide fallback dummy functions to avoid crashing
  generateToken = (req, res) => {
    console.error('generateToken called but CSRF not initialized');
    return 'dummy-token';
  };
  doubleCsrfProtection = (req, res, next) => next();
}

module.exports = {
  generateToken,
  doubleCsrfProtection,
};