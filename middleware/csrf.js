const { doubleCsrf } = require('csrf-csrf');

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'default-secret-change-in-production',
  cookieName: 'X-CSRF-Token',
  cookieOptions: {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

module.exports = {
  generateToken,
  doubleCsrfProtection,
};