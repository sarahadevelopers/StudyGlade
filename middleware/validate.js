const { body, param, validationResult } = require('express-validator');

// Middleware to check validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Common sanitizers for all text inputs
const sanitizeText = (field) => {
  return body(field)
    .trim()
    .escape()
    .stripLow()
    .blacklist('\\$\\{\\}');
};

// For emails
const sanitizeEmail = (field) => {
  return body(field)
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage('Invalid email address');
};

// For passwords (no sanitization, just validation)
const validatePassword = (field) => {
  return body(field)
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters');
};

// For MongoDB ObjectId in request BODY
const validateObjectId = (field) => {
  return body(field)
    .isMongoId()
    .withMessage('Invalid ID format');
};

// ✅ NEW: For MongoDB ObjectId in URL PARAMETERS
const validateParamId = (field) => {
  return param(field)
    .isMongoId()
    .withMessage('Invalid ID format');
};

module.exports = {
  handleValidationErrors,
  sanitizeText,
  sanitizeEmail,
  validatePassword,
  validateObjectId,
  validateParamId,   // export the new function
};