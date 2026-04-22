const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 1 },
  message: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Bid', bidSchema);