const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 1 },
  method: { type: String, enum: ['mpesa', 'paypal', 'bank', 'payoneer'], required: true },
  accountDetails: { type: Object, required: true },
  status: { type: String, enum: ['pending', 'approved', 'completed', 'rejected'], default: 'pending' },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Withdrawal', withdrawalSchema);