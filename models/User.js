const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  role: { type: String, enum: ['student', 'tutor', 'admin'], default: 'student' },
  isApproved: { type: Boolean, default: false },  // For tutors: becomes true only after application approved
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
  // NEW: Tutor application data (only for tutor role)
  tutorApplication: {
    qualifications: { type: String },               // e.g., degrees, experience
    subjects: [String],                            // parsed from comma‑separated input
    essay: { type: String, required: true },       // the 500‑1000 word essay
    essayFormat: { type: String, enum: ['APA', 'MLA'], default: 'APA' },
    portfolioUrl: { type: String },                // Cloudinary URL of uploaded portfolio file
    quizAnswers: { type: Object },                 // stored as { q1: 'A', q2: 'B', q3: 'False' }
    status: { 
      type: String, 
      enum: ['pending', 'approved', 'rejected'], 
      default: 'pending' 
    },
    adminFeedback: { type: String },               // reason for rejection, optional
    appliedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  refreshToken: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  lastActive: { type: Date, default: Date.now },
  // New: suspension fields (for admin control)
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
userSchema.index({ 'tutorApplication.status': 1 });  // for admin queries of pending applications

module.exports = mongoose.model('User', userSchema);