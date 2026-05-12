const express = require('express');
const router = express.Router();

console.log('✅ documents.js loaded (minimal version)');

// Test route – should return JSON
router.get('/', (req, res) => {
  res.json({ message: 'Documents route works', timestamp: new Date() });
});

// Dummy test route for test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Test route works' });
});

module.exports = router;