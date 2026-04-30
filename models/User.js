const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  role: { type: String, enum: ['student', 'tutor', 'admin'], default: 'student' },
  isApproved: { type: Boolean, default: false },
  walletBalance: { type: Number, default: 0, min: 0 },
  tutorProfile: {
    level: { 
      type: String, 
      enum: ['Entry', 'Entry-Level', 'Skilled', 'Expert', 'Premium'],
      default: 'Entry-Level' 
    },
    rating: { type: Number, default: 0 },
    completedQuestions: { type: Number, default: 0 },
    onTimeDeliveryRate: { type: Number, default: 100 },
    totalEarnings: { type: Number, default: 0 },
    responseTimeAvg: { type: Number, default: 0 },
    bio: { type: String, default: '' },
    subjects: [String],
    subjectCertifications: [String],
    levelHistory: [{ level: String, date: Date }]
  },
  tutorApplication: {
    qualifications: { type: String },
    subjects: [String],
    essay: { type: String },
    essayFormat: { type: String, enum: ['APA', 'MLA'], default: 'APA' },
    portfolioUrl: { type: String },
    quizAnswers: { type: Object },
    status: { 
      type: String, 
      enum: ['pending', 'approved', 'rejected'], 
      default: 'pending' 
    },
    adminFeedback: { type: String },
    appliedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  // ✅ NEW: Payment details for tutor payouts
  paymentDetails: {
    preferredMethod: { type: String, enum: ['paypal', 'mpesa', 'bank'], default: 'paypal' },
    paypalEmail: { type: String, default: '' },
    mpesaPhone: { type: String, default: '' },
    bankAccount: {
      bankName: { type: String, default: '' },
      accountName: { type: String, default: '' },
      accountNumber: { type: String, default: '' }
    }
  },
  refreshToken: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  lastActive: { type: Date, default: Date.now },
  isSuspended: { type: Boolean, default: false },
  suspensionReason: { type: String, default: '' },
  suspensionExpiry: { type: Date, default: null }
});

// Indexes
userSchema.index({ resetPasswordToken: 1 });
userSchema.index({ refreshToken: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isApproved: 1 });
userSchema.index({ isSuspended: 1 });
userSchema.index({ 'tutorApplication.status': 1 });

module.exports = mongoose.model('User', userSchema);