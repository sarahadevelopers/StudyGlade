const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: String,
  subcategory: String,
  budget: { type: Number, required: true, min: 3 },
  deadline: Date,
  files: [String],
  school: String,
  course: String,
  status: { 
    type: String, 
    enum: ['pending', 'assigned', 'completed', 'cancelled'], 
    default: 'pending' 
  },
  // Budget suggestion
  suggestedBudget: { type: Number, default: 0 },
  suggestedTutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  budgetSuggestionSent: { type: Boolean, default: false },
  // Answer file
  answerFile: { type: String, default: '' },
  answerFileName: { type: String, default: '' },
  answerUploadedAt: { type: Date, default: null },
  // Rating (student gives after completion)
  rating: {
    score: { type: Number, min: 1, max: 5 },
    feedback: { type: String },
    createdAt: { type: Date }
  },
  // Tutor requests additional funds
  additionalFundsRequest: {
    amount: { type: Number },
    reason: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestedAt: Date,
    studentResponseAt: Date
  },
  // Tutor cancellation reason (no penalty)
  cancellationReason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Question', questionSchema);