const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const User = require('../models/User');
const Question = require('../models/Question');
const Document = require('../models/Document');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const Bid = require('../models/Bid');
const Breach = require('../models/Breach');
const Announcement = require('../models/Announcement');
const Comment = require('../models/Comment');
const PDFDocument = require('pdfkit');
const router = express.Router();

// ========== PUBLIC ROUTE (no authentication required) – MUST BE FIRST ==========
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

// ========== ALL ADMIN ROUTES BELOW REQUIRE AUTH ==========
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

// ========== BREACH MANAGEMENT ==========
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

// ========== PDF REPORTS ==========
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

// ========== ANNOUNCEMENTS (admin CRUD) ==========
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

// ========== MANUAL TUTOR LEVEL OVERRIDE ==========
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

router.get('/questions/:id/full', async (req, res) => {
  try {
    const question = await Question.findById(req.params.id)
      .populate('studentId', 'fullName email')
      .populate('tutorId', 'fullName email');
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const comments = await Comment.find({ questionId: question._id })
      .populate('userId', 'fullName email')
      .sort({ createdAt: 1 });
    res.json({ question, comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== COMPREHENSIVE FINANCIAL REPORT ==========
// ========== COMPREHENSIVE FINANCIAL REPORT ==========
// ========== COMPREHENSIVE FINANCIAL REPORT (with pagination) ==========
// Helper function to fetch financial data (used by both JSON and PDF endpoints)
async function fetchFinancialReportData(userId, from, to, page = 1, limit = 20) {
  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) dateFilter.$lte = new Date(to);
  const transactionMatch = {};
  if (from || to) transactionMatch.createdAt = dateFilter;

  // ---------- Platform Summary ----------
  const allDeposits = await Transaction.aggregate([
    { $match: { type: 'deposit', ...transactionMatch } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const totalDeposits = allDeposits[0]?.total || 0;

  const allWithdrawals = await Transaction.aggregate([
    { $match: { type: 'withdraw', ...transactionMatch } },
    { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
  ]);
  const totalWithdrawals = allWithdrawals[0]?.total || 0;

  const questionCommission = await Question.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, totalCommission: { $sum: { $multiply: ['$budget', 0.24] } } } }
  ]);
  const totalQuestionCommission = questionCommission[0]?.totalCommission || 0;

  const documentSales = await Transaction.aggregate([
    { $match: { type: 'unlock_document', ...transactionMatch } },
    { $group: { _id: null, totalCommission: { $sum: { $multiply: [{ $abs: '$amount' }, 0.35] } } } }
  ]);
  const totalDocumentCommission = documentSales[0]?.totalCommission || 0;
  const platformRevenue = totalQuestionCommission + totalDocumentCommission;

  const pendingWithdrawals = await Withdrawal.countDocuments({ status: 'pending' });
  const pendingWithdrawalsAmount = await Withdrawal.aggregate([
    { $match: { status: 'pending' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const pendingWithdrawalsSum = pendingWithdrawalsAmount[0]?.total || 0;

  // ---------- Per-Student ----------
  const students = await User.find({ role: 'student' }).select('fullName email walletBalance');
  const studentData = await Promise.all(students.map(async (student) => {
    const funded = await Transaction.aggregate([
      { $match: { userId: student._id, type: 'deposit' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const spent = await Transaction.aggregate([
      { $match: { userId: student._id, type: { $in: ['post_question', 'unlock_document'] } } },
      { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
    ]);
    return {
      id: student._id,
      fullName: student.fullName,
      email: student.email,
      funded: funded[0]?.total || 0,
      spent: spent[0]?.total || 0,
      balance: student.walletBalance
    };
  }));

  // ---------- Per-Tutor ----------
  const tutorsData = await User.find({ role: 'tutor', isApproved: true }).select('fullName email walletBalance tutorProfile');
  const tutorDetailedData = await Promise.all(tutorsData.map(async (tutor) => {
    const questionEarnings = await Question.aggregate([
      { $match: { tutorId: tutor._id, status: 'completed' } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$budget', 0.76] } } } }
    ]);
    const documentEarnings = await Transaction.aggregate([
      { $match: { userId: tutor._id, type: 'tutor_payment', description: { $regex: /Document sale/ } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalEarned = (questionEarnings[0]?.total || 0) + (documentEarnings[0]?.total || 0);

    const questionCommissionDeducted = await Question.aggregate([
      { $match: { tutorId: tutor._id, status: 'completed' } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$budget', 0.24] } } } }
    ]);
    const docCommissionDeducted = await Transaction.aggregate([
      { $match: { userId: tutor._id, type: 'tutor_payment', description: { $regex: /Document sale/ } } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$amount', 0.35 / 0.65] } } } }
    ]);
    const totalCommissionDeducted = (questionCommissionDeducted[0]?.total || 0) + (docCommissionDeducted[0]?.total || 0);

    const withdrawals = await Transaction.aggregate([
      { $match: { userId: tutor._id, type: 'withdraw' } },
      { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
    ]);
    return {
      id: tutor._id,
      fullName: tutor.fullName,
      email: tutor.email,
      earnings: totalEarned,
      commissionDeducted: totalCommissionDeducted,
      withdrawals: withdrawals[0]?.total || 0,
      balance: tutor.walletBalance,
      tutorProfile: tutor.tutorProfile
    };
  }));

  // ---------- Withdrawal History ----------
  const withdrawalHistory = await Withdrawal.find({ status: 'approved' })
    .populate('userId', 'fullName email')
    .sort({ processedAt: -1 })
    .limit(100);
  const withdrawalList = withdrawalHistory.map(w => ({
    name: w.userId?.fullName,
    email: w.userId?.email,
    amount: w.amount,
    method: w.method,
    date: w.processedAt || w.createdAt
  }));

  // ---------- Refunds ----------
  const refunds = await Transaction.find({ type: 'refund' })
    .populate('userId', 'fullName email')
    .sort({ createdAt: -1 })
    .limit(100);
  const refundList = refunds.map(r => ({
    name: r.userId?.fullName,
    email: r.userId?.email,
    amount: Math.abs(r.amount),
    description: r.description,
    date: r.createdAt
  }));

  // ---------- Paginated Transactions ----------
  const skip = (page - 1) * limit;
  const transactionsQuery = Transaction.find(transactionMatch)
    .populate('userId', 'fullName email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  const totalTransactions = await Transaction.countDocuments(transactionMatch);
  const allTransactions = await transactionsQuery;
  const transactionList = allTransactions.map(t => ({
    user: t.userId?.fullName || 'System',
    email: t.userId?.email,
    type: t.type,
    amount: t.amount,
    description: t.description,
    date: t.createdAt
  }));

  return {
    summary: {
      totalDeposits,
      totalWithdrawals,
      platformRevenue,
      totalQuestionCommission,
      totalDocumentCommission,
      pendingWithdrawals,
      pendingWithdrawalsAmount: pendingWithdrawalsSum
    },
    students: studentData,
    tutors: tutorDetailedData,
    withdrawalHistory: withdrawalList,
    refunds: refundList,
    transactions: transactionList,
    pagination: {
      page,
      limit,
      total: totalTransactions,
      pages: Math.ceil(totalTransactions / limit)
    }
  };
}

// JSON endpoint with pagination
router.get('/financial-report', async (req, res) => {
  try {
    const { from, to, page = 1, limit = 20 } = req.query;
    const data = await fetchFinancialReportData(req.userId, from, to, parseInt(page), parseInt(limit));
    res.json(data);
  } catch (err) {
    console.error('Financial report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PDF Financial Report (reuses helper)
router.get('/reports/financial', async (req, res) => {
  try {
    const { from, to } = req.query;
    const data = await fetchFinancialReportData(req.userId, from, to, 1, 1000); // get many for PDF
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=financial_report.pdf');
    doc.pipe(res);

    doc.fontSize(18).text('Financial Report', { align: 'center' });
    doc.moveDown();

    doc.fontSize(14).text('Summary', { underline: true });
    doc.fontSize(10);
    doc.text(`Total Deposits: $${data.summary.totalDeposits.toFixed(2)}`);
    doc.text(`Total Withdrawals: $${data.summary.totalWithdrawals.toFixed(2)}`);
    doc.text(`Platform Revenue: $${data.summary.platformRevenue.toFixed(2)}`);
    doc.moveDown();

    doc.fontSize(14).text('Students', { underline: true });
    doc.fontSize(10);
    data.students.forEach(s => {
      doc.text(`${s.fullName} (${s.email}): Funded $${s.funded.toFixed(2)}, Spent $${s.spent.toFixed(2)}, Balance $${s.balance.toFixed(2)}`);
    });
    doc.moveDown();

    doc.fontSize(14).text('Tutors', { underline: true });
    doc.fontSize(10);
    data.tutors.forEach(t => {
      doc.text(`${t.fullName} (${t.email}): Earnings $${t.earnings.toFixed(2)}, Commission $${t.commissionDeducted.toFixed(2)}, Withdrawals $${t.withdrawals.toFixed(2)}, Balance $${t.balance.toFixed(2)}`);
    });
    doc.moveDown();

    doc.fontSize(14).text('Transactions (last 1000)', { underline: true });
    doc.fontSize(10);
    data.transactions.slice(0, 100).forEach(tx => {
      doc.text(`${tx.user} - ${tx.type}: $${Math.abs(tx.amount).toFixed(2)} (${new Date(tx.date).toLocaleDateString()})`);
    });

    doc.end();
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
