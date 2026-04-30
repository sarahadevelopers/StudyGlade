const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const User = require('../models/User');
const Question = require('../models/Question');
const Document = require('../models/Document');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const Bid = require('../models/Bid');
const router = express.Router();

// All admin routes require admin role
router.use(auth, roleCheck('admin'));

// ---------- Users ----------
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password -refreshToken -resetPasswordToken -resetPasswordExpires');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve or reject a simple tutor approval (old method, kept for compatibility)
router.put('/users/:id/approve', async (req, res) => {
  try {
    const { isApproved } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.isApproved = isApproved;
    if (user.role === 'tutor' && isApproved && user.tutorApplication?.status === 'pending') {
      user.tutorApplication.status = 'approved';
      user.tutorApplication.reviewedAt = new Date();
      user.tutorApplication.reviewedBy = req.userId;
    }
    await user.save();
    res.json({ message: `Tutor ${isApproved ? 'approved' : 'rejected'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve or reject a tutor application with feedback
router.put('/users/:id/approve-tutor', async (req, res) => {
  try {
    const { approved, feedback } = req.body;
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'tutor') {
      return res.status(404).json({ error: 'Tutor not found' });
    }
    if (!user.tutorApplication) {
      return res.status(400).json({ error: 'No application found for this tutor' });
    }
    user.tutorApplication.status = approved ? 'approved' : 'rejected';
    user.tutorApplication.adminFeedback = feedback || '';
    user.tutorApplication.reviewedAt = new Date();
    user.tutorApplication.reviewedBy = req.userId;
    user.isApproved = approved;
    if (approved) {
      user.tutorProfile.level = 'Entry-Level';
      // Optionally send email notification
    }
    await user.save();
    res.json({ message: approved ? 'Tutor approved' : 'Tutor rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Suspend or unsuspend a user
router.put('/users/:id/suspend', async (req, res) => {
  try {
    const { isSuspended, reason, expiryDays } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.isSuspended = isSuspended;
    if (isSuspended) {
      user.suspensionReason = reason || 'Violation of platform rules';
      if (expiryDays) {
        user.suspensionExpiry = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
      } else {
        user.suspensionExpiry = null; // indefinite
      }
    } else {
      user.suspensionReason = '';
      user.suspensionExpiry = null;
    }
    await user.save();
    res.json({ message: isSuspended ? 'User suspended' : 'User unsuspended' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Questions ----------
router.get('/questions', async (req, res) => {
  try {
    const questions = await Question.find().populate('studentId tutorId', 'fullName email');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Documents ----------
router.get('/documents', async (req, res) => {
  try {
    const docs = await Document.find().populate('uploaderId', 'fullName email');
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/documents/:id/approve', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    doc.isApproved = true;
    await doc.save();
    res.json({ message: 'Document approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NEW: Update document metadata
router.put('/documents/:id', async (req, res) => {
  try {
    const { title, price, description, subject, level, type } = req.body;
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (title) doc.title = title;
    if (price) doc.price = price;
    if (description) doc.description = description;
    if (subject) doc.subject = subject;
    if (level) doc.level = level;
    if (type) doc.type = type;
    await doc.save();
    res.json({ message: 'Document updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NEW: Delete a document
router.delete('/documents/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    await doc.deleteOne();
    res.json({ message: 'Document deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Analytics ----------
router.get('/analytics', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalTutors = await User.countDocuments({ role: 'tutor', isApproved: true });
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalQuestions = await Question.countDocuments();
    const completedQuestions = await Question.countDocuments({ status: 'completed' });
    const totalDocuments = await Document.countDocuments({ isApproved: true });
    const totalRevenue = await Transaction.aggregate([
      { $match: { type: 'deposit' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    res.json({
      totalUsers,
      totalTutors,
      totalStudents,
      totalQuestions,
      completedQuestions,
      totalDocuments,
      totalRevenue: totalRevenue[0]?.total || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NEW: Revenue timeline (last 6 months, monthly)
router.get('/revenue-timeline', async (req, res) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const revenue = await Transaction.aggregate([
      { $match: { type: 'deposit', createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          total: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    res.json(revenue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NEW: Top 5 tutors by earnings
router.get('/top-tutors', async (req, res) => {
  try {
    const tutors = await User.find({ role: 'tutor', isApproved: true })
      .select('fullName tutorProfile.totalEarnings')
      .sort({ 'tutorProfile.totalEarnings': -1 })
      .limit(5);
    res.json(tutors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NEW: Top 5 documents by downloads (most purchased)
router.get('/top-documents', async (req, res) => {
  try {
    const docs = await Document.find({ isApproved: true })
      .select('title downloads')
      .sort({ downloads: -1 })
      .limit(5);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Withdrawals ----------
router.get('/withdrawals', async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find().populate('userId', 'fullName email walletBalance');
    res.json(withdrawals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/withdrawals/:id/approve', async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id).populate('userId');
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ error: 'Already processed' });

    withdrawal.status = 'approved';
    withdrawal.processedBy = req.userId;
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    console.log(`Withdrawal #${withdrawal._id} approved for ${withdrawal.userId.email} - $${withdrawal.amount}`);
    res.json({ message: 'Withdrawal approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/withdrawals/:id/reject', async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id).populate('userId');
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ error: 'Already processed' });

    const user = await User.findById(withdrawal.userId._id);
    if (user) {
      user.walletBalance += withdrawal.amount;
      await user.save();
      await Transaction.create({
        userId: user._id,
        type: 'refund',
        amount: withdrawal.amount,
        description: `Rejected withdrawal #${withdrawal._id} – refunded`
      });
    }

    withdrawal.status = 'rejected';
    withdrawal.processedBy = req.userId;
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    res.json({ message: 'Withdrawal rejected, funds refunded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- NOTIFICATIONS (combined recent events) ----------
router.get('/notifications', async (req, res) => {
  try {
    const tutorApps = await User.find({ 'tutorApplication.status': 'pending' })
      .select('fullName email createdAt')
      .limit(5)
      .sort({ createdAt: -1 });
    const withdrawals = await Withdrawal.find({ status: 'pending' })
      .populate('userId', 'fullName')
      .limit(5)
      .sort({ createdAt: -1 });
    const documents = await Document.find({ isApproved: false })
      .populate('uploaderId', 'fullName')
      .limit(5)
      .sort({ createdAt: -1 });

    const notifications = [
      ...tutorApps.map(app => ({
        type: 'tutor_application',
        message: `${app.fullName} applied as tutor`,
        createdAt: app.createdAt,
        link: '#tutor-apps'
      })),
      ...withdrawals.map(w => ({
        type: 'withdrawal',
        message: `${w.userId.fullName} requested $${w.amount} withdrawal`,
        createdAt: w.createdAt,
        link: '#withdrawals'
      })),
      ...documents.map(d => ({
        type: 'document',
        message: `${d.uploaderId.fullName} uploaded "${d.title}"`,
        createdAt: d.createdAt,
        link: '#documents'
      }))
    ];
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(notifications.slice(0, 20));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- User Dashboard (admin view) ----------
router.get('/users/:id/dashboard', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -refreshToken -resetPasswordToken -resetPasswordExpires');
    if (!user) return res.status(404).json({ error: 'User not found' });

    let questions = [];
    let transactions = [];
    let bids = [];

    if (user.role === 'student') {
      questions = await Question.find({ studentId: user._id })
        .populate('tutorId', 'fullName email')
        .sort({ createdAt: -1 });
      transactions = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50);
    } else if (user.role === 'tutor') {
      questions = await Question.find({ tutorId: user._id })
        .populate('studentId', 'fullName email')
        .sort({ createdAt: -1 });
      bids = await Bid.find({ tutorId: user._id }).populate('questionId', 'title budget');
      transactions = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50);
    }

    res.json({
      user,
      questions,
      transactions,
      bids: bids.length ? bids : undefined
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;