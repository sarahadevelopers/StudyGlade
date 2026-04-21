const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const Question = require('../models/Question');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const router = express.Router();

// Post a question (student only)
router.post('/', auth, roleCheck('student'), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const { title, description, category, subcategory, budget, deadline, school, course, files } = req.body;
    if (user.walletBalance < budget) return res.status(400).json({ error: 'Insufficient wallet balance' });
    const question = await Question.create({
      studentId: req.userId,
      title,
      description,
      category,
      subcategory,
      budget,
      deadline,
      school,
      course,
      files: files || []
    });
    // Deduct budget
    user.walletBalance -= budget;
    await user.save();
    await Transaction.create({ userId: req.userId, type: 'post_question', amount: -budget, description: `Posted question: ${title}`, referenceId: question._id });
    res.status(201).json(question);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all pending questions (for tutors)
router.get('/pending', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const questions = await Question.find({ status: 'pending' }).populate('studentId', 'fullName');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get my questions (student)
router.get('/my-questions', auth, roleCheck('student'), async (req, res) => {
  try {
    const questions = await Question.find({ studentId: req.userId }).populate('tutorId', 'fullName');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get tutor's assigned questions
router.get('/my-assignments', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const questions = await Question.find({ tutorId: req.userId }).populate('studentId', 'fullName');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accept a question (tutor assigns themselves)
router.put('/:id/accept', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.status !== 'pending') return res.status(400).json({ error: 'Question already assigned' });
    question.tutorId = req.userId;
    question.status = 'assigned';
    await question.save();
    res.json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Complete a question (tutor marks as completed)
router.put('/:id/complete', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.tutorId.toString() !== req.userId) return res.status(403).json({ error: 'Not your question' });
    question.status = 'completed';
    await question.save();
    // Pay tutor 76% of budget
    const tutor = await User.findById(req.userId);
    const earnings = question.budget * 0.76;
    tutor.walletBalance += earnings;
    await tutor.save();
    await Transaction.create({ userId: req.userId, type: 'tutor_payment', amount: earnings, description: `Completed question: ${question.title}`, referenceId: question._id });
    res.json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;