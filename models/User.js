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
  refreshToken: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  lastActive: Date
});

// Add indexes for faster queries
userSchema.index({ resetPasswordToken: 1 });      // used when validating reset tokens
userSchema.index({ refreshToken: 1 });            // used when looking up user by refresh token
userSchema.index({ role: 1 });                    // used for filtering users by role (admin dashboard)
userSchema.index({ isApproved: 1 });              // used for pending tutor approvals

module.exports = mongoose.model('User', userSchema);