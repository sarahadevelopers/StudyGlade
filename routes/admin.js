const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const User = require('../models/User');
const Question = require('../models/Question');
const Document = require('../models/Document');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal'); // new
const router = express.Router();

// All admin routes require admin role
router.use(auth, roleCheck('admin'));

// ---------- Existing routes ----------
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password');
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
    await user.save();
    // Optional: send email notification
    res.json({ message: `Tutor ${isApproved ? 'approved' : 'rejected'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/questions', async (req, res) => {
  try {
    const questions = await Question.find().populate('studentId tutorId', 'fullName email');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

router.get('/analytics', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalTutors = await User.countDocuments({ role: 'tutor', isApproved: true });
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalQuestions = await Question.countDocuments();
    const completedQuestions = await Question.countDocuments({ status: 'completed' });
    const totalDocuments = await Document.countDocuments({ isApproved: true });
    const totalRevenue = await Transaction.aggregate([{ $match: { type: 'deposit' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    res.json({
      totalUsers, totalTutors, totalStudents, totalQuestions, completedQuestions, totalDocuments,
      totalRevenue: totalRevenue[0]?.total || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- NEW: Withdrawal management ----------
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

    // In a real system, you would call an external API (PayPal, Mpesa) here.
    // For now, we just mark as approved.
    withdrawal.status = 'approved';
    withdrawal.processedBy = req.userId;
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    // Optional: record a transaction for the deduction (already deducted from wallet at request time)
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

    // Refund the amount back to user's wallet
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

module.exports = router;