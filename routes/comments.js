const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const auth = require('../middleware/auth');
const Comment = require('../models/Comment');
const Question = require('../models/Question');
const User = require('../models/User');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Configure Cloudinary (you already have this in other routes)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Get comments for a specific question
router.get('/question/:questionId', async (req, res) => {
  try {
    const comments = await Comment.find({ questionId: req.params.questionId }).sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a comment (tutor, student, or admin) with optional file attachment
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    const { questionId, text } = req.body;
    if (!text && !req.file) {
      return res.status(400).json({ error: 'Comment cannot be empty – provide text or file' });
    }

    const question = await Question.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const user = await User.findById(req.userId);
    const isOwner = question.studentId.toString() === req.userId;
    const isAssignedTutor = question.tutorId && question.tutorId.toString() === req.userId;
    const isAdmin = user.role === 'admin';
    if (!isOwner && !isAssignedTutor && !isAdmin) {
      return res.status(403).json({ error: 'You cannot comment on this question' });
    }

    let fileUrl = null;
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, { folder: 'studyglade/comments' });
      fileUrl = result.secure_url;
      await fs.unlink(req.file.path); // delete temporary file
    }

    const comment = await Comment.create({
      questionId,
      userId: req.userId,
      userRole: user.role,
      userName: user.fullName,
      text: text || '',
      fileUrl
    });
    res.status(201).json(comment);
  } catch (err) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    console.error('Comment post error:', err);
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