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
  isDemo: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['pending', 'assigned', 'completed', 'cancelled'],
    default: 'pending'
  },
  // Budget suggestion
  suggestedBudget: { type: Number, default: 0 },
  suggestedTutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  budgetSuggestionSent: { type: Boolean, default: false },
  
  // ---------- Answer upload (legacy single file) ----------
  answerFile: { type: String, default: '' },
  answerFileName: { type: String, default: '' },
  
  // ---------- Multiple answer files (new) ----------
  answerFiles: { type: [String], default: [] },       // array of Cloudinary URLs
  answerFileNames: { type: [String], default: [] },   // original file names
  
  answerUploadedAt: { type: Date, default: null },
  
  // Rating
  rating: {
    score: { type: Number, min: 1, max: 5 },
    feedback: { type: String },
    createdAt: { type: Date }
  },
  // Additional funds request
  additionalFundsRequest: {
    amount: { type: Number },
    reason: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    requestedAt: Date,
    studentResponseAt: Date
  },
  // Tutor cancellation reason
  cancellationReason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

// Index for faster demo question filtering
questionSchema.index({ isDemo: 1 });

module.exports = mongoose.model('Question', questionSchema);