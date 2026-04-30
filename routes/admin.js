const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const User = require('../models/User');
const Question = require('../models/Question');
const Document = require('../models/Document');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const Bid = require('../models/Bid');
const Breach = require('../models/Breach');           // ✅ Phase 3
const Announcement = require('../models/Announcement'); // ✅ Phase 3
const PDFDocument = require('pdfkit');               // ✅ Phase 3 (install pdfkit)
const router = express.Router();

// All admin routes require admin role
router.use(auth, roleCheck('admin'));

// ========== USERS ==========
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password -refreshToken -resetPasswordToken -resetPasswordExpires');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

router.put('/users/:id/approve-tutor', async (req, res) => {
  try {
    const { approved, feedback } = req.body;
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'tutor') return res.status(404).json({ error: 'Tutor not found' });
    if (!user.tutorApplication) return res.status(400).json({ error: 'No application found for this tutor' });
    user.tutorApplication.status = approved ? 'approved' : 'rejected';
    user.tutorApplication.adminFeedback = feedback || '';
    user.tutorApplication.reviewedAt = new Date();
    user.tutorApplication.reviewedBy = req.userId;
    user.isApproved = approved;
    if (approved) user.tutorProfile.level = 'Entry-Level';
    await user.save();
    res.json({ message: approved ? 'Tutor approved' : 'Tutor rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/suspend', async (req, res) => {
  try {
    const { isSuspended, reason, expiryDays } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.isSuspended = isSuspended;
    if (isSuspended) {
      user.suspensionReason = reason || 'Violation of platform rules';
      user.suspensionExpiry = expiryDays ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000) : null;
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

// ========== QUESTIONS ==========
router.get('/questions', async (req, res) => {
  try {
    const questions = await Question.find().populate('studentId tutorId', 'fullName email');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== DOCUMENTS ==========
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

// ========== ANALYTICS & CHARTS ==========
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
      totalUsers, totalTutors, totalStudents, totalQuestions,
      completedQuestions, totalDocuments,
      totalRevenue: totalRevenue[0]?.total || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// ========== WITHDRAWALS ==========
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

// ========== NOTIFICATIONS (recent events) ==========
router.get('/notifications', async (req, res) => {
  try {
    const tutorApps = await User.find({ 'tutorApplication.status': 'pending' })
      .select('fullName email createdAt').limit(5).sort({ createdAt: -1 });
    const withdrawals = await Withdrawal.find({ status: 'pending' })
      .populate('userId', 'fullName').limit(5).sort({ createdAt: -1 });
    const documents = await Document.find({ isApproved: false })
      .populate('uploaderId', 'fullName').limit(5).sort({ createdAt: -1 });
    const notifications = [
      ...tutorApps.map(app => ({ type: 'tutor_application', message: `${app.fullName} applied as tutor`, createdAt: app.createdAt, link: '#tutor-apps' })),
      ...withdrawals.map(w => ({ type: 'withdrawal', message: `${w.userId.fullName} requested $${w.amount} withdrawal`, createdAt: w.createdAt, link: '#withdrawals' })),
      ...documents.map(d => ({ type: 'document', message: `${d.uploaderId.fullName} uploaded "${d.title}"`, createdAt: d.createdAt, link: '#documents' }))
    ];
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(notifications.slice(0, 20));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== USER DASHBOARD (admin view) ==========
router.get('/users/:id/dashboard', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -refreshToken -resetPasswordToken -resetPasswordExpires');
    if (!user) return res.status(404).json({ error: 'User not found' });
    let questions = [], transactions = [], bids = [];
    if (user.role === 'student') {
      questions = await Question.find({ studentId: user._id }).populate('tutorId', 'fullName email').sort({ createdAt: -1 });
      transactions = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50);
    } else if (user.role === 'tutor') {
      questions = await Question.find({ tutorId: user._id }).populate('studentId', 'fullName email').sort({ createdAt: -1 });
      bids = await Bid.find({ tutorId: user._id }).populate('questionId', 'title budget');
      transactions = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50);
    }
    res.json({ user, questions, transactions, bids: bids.length ? bids : undefined });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== BREACH MANAGEMENT (Phase 3) ==========
router.get('/breaches', async (req, res) => {
  try {
    const breaches = await Breach.find().populate('userId', 'fullName email').sort({ createdAt: -1 });
    res.json(breaches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/breaches', async (req, res) => {
  try {
    const { userId, type, reason, severity, expiresAt } = req.body;
    const breach = await Breach.create({ userId, type, reason, severity, expiresAt });
    if (type === 'suspension') {
      // Also suspend the user via the existing suspend endpoint
      const expiryDays = expiresAt ? Math.ceil((new Date(expiresAt) - Date.now()) / (1000*60*60*24)) : null;
      // We need to call suspend endpoint – we can directly update user or call internal function
      const user = await User.findById(userId);
      if (user) {
        user.isSuspended = true;
        user.suspensionReason = reason;
        user.suspensionExpiry = expiresAt || null;
        await user.save();
      }
    }
    res.status(201).json(breach);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/breaches/:id/resolve', async (req, res) => {
  try {
    const breach = await Breach.findById(req.params.id);
    if (!breach) return res.status(404).json({ error: 'Not found' });
    breach.resolved = true;
    breach.resolvedBy = req.userId;
    breach.resolvedAt = new Date();
    await breach.save();
    res.json({ message: 'Breach resolved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== PDF REPORTS (Phase 3) ==========
// Helper: Generate PDF buffer
async function generateTutorPerformancePDF() {
  const tutors = await User.find({ role: 'tutor', isApproved: true })
    .select('fullName email tutorProfile.rating tutorProfile.completedQuestions tutorProfile.totalEarnings');
  const doc = new PDFDocument();
  let buffers = [];
  doc.on('data', buffers.push.bind(buffers));
  doc.on('end', () => {});
  doc.fontSize(18).text('Tutor Performance Report', { align: 'center' });
  doc.moveDown();
  tutors.forEach(t => {
    doc.fontSize(12).text(`Name: ${t.fullName}`);
    doc.text(`Email: ${t.email}`);
    doc.text(`Rating: ${t.tutorProfile.rating || 0} ⭐`);
    doc.text(`Completed Questions: ${t.tutorProfile.completedQuestions || 0}`);
    doc.text(`Total Earnings: $${(t.tutorProfile.totalEarnings || 0).toFixed(2)}`);
    doc.moveDown();
  });
  doc.end();
  return new Promise(resolve => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
  });
}

router.get('/reports/tutor-performance', async (req, res) => {
  try {
    const buffer = await generateTutorPerformancePDF();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=tutor_performance.pdf');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/reports/revenue', async (req, res) => {
  try {
    const deposits = await Transaction.aggregate([
      { $match: { type: 'deposit' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const withdrawalsTotal = await Transaction.aggregate([
      { $match: { type: 'withdraw' } },
      { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
    ]);
    const platformRevenue = (deposits[0]?.total || 0) - (withdrawalsTotal[0]?.total || 0);
    const doc = new PDFDocument();
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.fontSize(18).text('Revenue Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Total Deposits: $${(deposits[0]?.total || 0).toFixed(2)}`);
    doc.text(`Total Withdrawals: $${(withdrawalsTotal[0]?.total || 0).toFixed(2)}`);
    doc.text(`Platform Revenue: $${platformRevenue.toFixed(2)}`);
    doc.end();
    return new Promise(resolve => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
    }).then(buffer => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=revenue_report.pdf');
      res.send(buffer);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/reports/top-documents', async (req, res) => {
  try {
    const docs = await Document.find({ isApproved: true })
      .select('title downloads price')
      .sort({ downloads: -1 })
      .limit(10);
    const doc = new PDFDocument();
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.fontSize(18).text('Top Documents Report', { align: 'center' });
    doc.moveDown();
    docs.forEach(d => {
      doc.fontSize(12).text(`Title: ${d.title}`);
      doc.text(`Downloads: ${d.downloads || 0}`);
      doc.text(`Price: $${d.price}`);
      doc.moveDown();
    });
    doc.end();
    return new Promise(resolve => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
    }).then(buffer => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=top_documents.pdf');
      res.send(buffer);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ANNOUNCEMENTS (Phase 3) ==========
router.get('/announcements', async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const { title, message, expiresAt } = req.body;
    const announcement = await Announcement.create({ title, message, expiresAt, createdBy: req.userId });
    res.status(201).json(announcement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/announcements/:id', async (req, res) => {
  try {
    const { isActive, title, message, expiresAt } = req.body;
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Not found' });
    if (isActive !== undefined) announcement.isActive = isActive;
    if (title) announcement.title = title;
    if (message) announcement.message = message;
    if (expiresAt) announcement.expiresAt = expiresAt;
    await announcement.save();
    res.json(announcement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/announcements/:id', async (req, res) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public endpoint for active announcements (no auth required)
router.get('/public/announcements', async (req, res) => {
  try {
    const now = new Date();
    const announcements = await Announcement.find({
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
    }).sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== MANUAL TUTOR LEVEL OVERRIDE (Phase 3) ==========
router.put('/tutors/:id/level', async (req, res) => {
  try {
    const { level, reason } = req.body;
    const tutor = await User.findById(req.params.id);
    if (!tutor || tutor.role !== 'tutor') return res.status(404).json({ error: 'Tutor not found' });
    const oldLevel = tutor.tutorProfile.level;
    tutor.tutorProfile.level = level;
    if (!tutor.tutorProfile.levelHistory) tutor.tutorProfile.levelHistory = [];
    tutor.tutorProfile.levelHistory.push({ level, date: new Date() });
    await tutor.save();
    // Log a breach record for manual override
    await Breach.create({
      userId: tutor._id,
      type: 'manual_override',
      reason: `Level changed from ${oldLevel} to ${level} by admin. Reason: ${reason || 'Not specified'}`,
      severity: 'low'
    });
    res.json({ message: `Tutor level updated to ${level}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;