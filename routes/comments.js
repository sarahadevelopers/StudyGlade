const express = require('express');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const auth = require('../middleware/auth');
const Comment = require('../models/Comment');
const Question = require('../models/Question');
const User = require('../models/User');
const { upload } = require('../server');   // global upload with validation

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Get comments for a specific question (auth required to check role)
router.get('/question/:questionId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const isAdmin = user.role === 'admin';
    let filter = { questionId: req.params.questionId };
    if (!isAdmin) {
      filter.deleted = { $ne: true }; // hide deleted comments from non‑admins
    }
    const comments = await Comment.find(filter).sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a comment (tutor, student, admin) with optional file attachment
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
      await fs.unlink(req.file.path);
    }

    const comment = await Comment.create({
      questionId,
      userId: req.userId,
      userRole: user.role,
      userName: user.fullName,
      text: text || '',
      fileUrl,
      deleted: false,       // explicit default
      deletedAt: null
    });
    res.status(201).json(comment);
  } catch (err) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    console.error('Comment post error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Soft delete comment (owner or admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const user = await User.findById(req.userId);
    const isOwner = comment.userId.toString() === req.userId;
    const isAdmin = user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Soft delete instead of hard delete
    comment.deleted = true;
    comment.deletedAt = new Date();
    await comment.save();

    res.json({ message: 'Comment deleted (admin can still see it)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;