const mongoose = require('mongoose');

const contentFilterLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userEmail: { type: String, required: true },
  userRole: { type: String, enum: ['student', 'tutor', 'admin'] },
  action: { type: String, enum: ['comment', 'bid', 'question', 'funds_request'], required: true },
  blockedText: { type: String },
  detectedPattern: { type: String }, // 'email', 'phone', 'url', 'keyword'
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ContentFilterLog', contentFilterLogSchema);