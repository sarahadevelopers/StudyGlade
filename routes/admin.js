const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const User = require('../models/User');
const Question = require('../models/Question');
const Document = require('../models/Document');
const Transaction = require('../models/Transaction');
const router = express.Router();

// All admin routes require admin role
router.use(auth, roleCheck('admin'));

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve or reject tutor
router.put('/users/:id/approve', async (req, res) => {
  try {
    const { isApproved } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.isApproved = isApproved;
    await user.save();
    res.json({ message: `Tutor ${isApproved ? 'approved' : 'rejected'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all questions
router.get('/questions', async (req, res) => {
  try {
    const questions = await Question.find().populate('studentId tutorId', 'fullName email');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all documents (including unapproved)
router.get('/documents', async (req, res) => {
  try {
    const docs = await Document.find().populate('uploaderId', 'fullName email');
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve document
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

// Platform analytics
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

module.exports = router;