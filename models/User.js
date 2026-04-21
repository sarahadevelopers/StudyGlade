const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  role: { type: String, enum: ['student', 'tutor', 'admin'], default: 'student' },
  isApproved: { type: Boolean, default: false },
  walletBalance: { type: Number, default: 0 },
  tutorProfile: {
    level: { type: String, default: 'Entry' },
    rating: { type: Number, default: 0 },
    completedQuestions: { type: Number, default: 0 },
    bio: String,
    subjects: [String]
  },
  createdAt: { type: Date, default: Date.now },
  lastActive: Date
});

module.exports = mongoose.model('User', userSchema);