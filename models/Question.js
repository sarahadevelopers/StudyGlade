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
  // --- New fields for budget suggestion system ---
  suggestedBudget: { type: Number, default: 0 },
  suggestedTutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  budgetSuggestionSent: { type: Boolean, default: false },
  // ------------------------------------------------
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Question', questionSchema);