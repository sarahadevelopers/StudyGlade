const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const Comment = require('../models/Comment');
const Question = require('../models/Question');
const User = require('../models/User');
const router = express.Router();

// Get comments for a specific question
router.get('/question/:questionId', async (req, res) => {
  try {
    const comments = await Comment.find({ questionId: req.params.questionId }).sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a comment (tutor, student, or admin)
router.post('/', auth, async (req, res) => {
  try {
    const { questionId, text } = req.body;
    if (!text.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });

    const question = await Question.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const user = await User.findById(req.userId);
    // Allow: student who owns the question, assigned tutor, or admin
    const isOwner = question.studentId.toString() === req.userId;
    const isAssignedTutor = question.tutorId && question.tutorId.toString() === req.userId;
    const isAdmin = user.role === 'admin';
    if (!isOwner && !isAssignedTutor && !isAdmin) {
      return res.status(403).json({ error: 'You cannot comment on this question' });
    }

    const comment = await Comment.create({
      questionId,
      userId: req.userId,
      userRole: user.role,
      userName: user.fullName,
      text
    });
    res.status(201).json(comment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete comment (owner or admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const user = await User.findById(req.userId);
    if (comment.userId.toString() !== req.userId && user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await comment.deleteOne();
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;