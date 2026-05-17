const express = require('express');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const auth = require('../middleware/auth');
const Comment = require('../models/Comment');
const Question = require('../models/Question');
const User = require('../models/User');
const Notification = require('../models/Notification');
const ContentFilterLog = require('../models/ContentFilterLog');
const { upload } = require('../server');
const { containsContactInfo, getMatchingPattern, redactContactInfo } = require('../utils/contentFilter');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Get comments for a specific question
router.get('/question/:questionId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const isAdmin = user.role === 'admin';
    let filter = { questionId: req.params.questionId };
    if (!isAdmin) {
      filter.deleted = { $ne: true };
    }
    const comments = await Comment.find(filter).sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a comment (tutor, student, admin) with optional file attachment AND send notification
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    const { questionId, text } = req.body;
    if (!text && !req.file) {
      return res.status(400).json({ error: 'Comment cannot be empty – provide text or file' });
    }

    // --- Fetch user early for logging ---
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // ---- BLOCK CONTACT INFO & LOG ATTEMPT (only for text, not for file name) ----
      // ---- BLOCK CONTACT INFO & LOG ATTEMPT (only for text, not for file name) ----
    if (text && containsContactInfo(text)) {
      await ContentFilterLog.create({
        userId: req.userId,
        userEmail: user.email,
        userRole: user.role,
        action: 'comment',
        blockedText: text.substring(0, 200),
        detectedPattern: getMatchingPattern(text)
      }).catch(err => console.error('Failed to log content filter attempt:', err));

      // ✅ NEW: Notify all admins in real time
      const admins = await User.find({ role: 'admin' });
      const io = req.app.get('io');
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          type: 'content_violation',
          title: 'Content Violation Detected',
          message: `${user.fullName} attempted to post blocked content: ${text.substring(0, 100)}`,
          link: '/admin-dashboard.html?section=content-violations',
          read: false
        }).catch(err => console.error('Failed to create admin notification:', err));
        if (io) {
          io.to(`user_${admin._id}`).emit('notification_new', {
            message: `Violation from ${user.fullName}`
          });
        }
      }

      return res.status(400).json({ 
        error: 'Messages cannot contain email addresses, phone numbers, URLs, or third‑party contact information (e.g., WhatsApp, Telegram, social media).' 
      });
    }
    
    const question = await Question.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const isOwner = question.studentId.toString() === req.userId;
    const isAssignedTutor = question.tutorId && question.tutorId.toString() === req.userId;
    const isAdmin = user.role === 'admin';
    if (!isOwner && !isAssignedTutor && !isAdmin) {
      return res.status(403).json({ error: 'You cannot comment on this question' });
    }

    let fileUrl = null;
    if (req.file) {
      // Determine resource type: images go to 'image', everything else to 'raw'
      let resourceType = 'raw';
      if (req.file.mimetype.startsWith('image/')) {
        resourceType = 'image';
      }
      console.log(`[COMMENT] Uploading ${req.file.originalname} as ${resourceType}`);
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'studyglade/comments',
        resource_type: resourceType
      });
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
      deleted: false,
      deletedAt: null
    });

    // ---------- Send notification(s) ----------
    const commentPreview = text ? text.substring(0, 100) : (req.file ? '📎 Attached a file' : 'New comment');
    const link = `/question-details.html?id=${question._id}`;

    const recipients = [];

    if (isAdmin) {
      recipients.push({ userId: question.studentId, role: 'student' });
      if (question.tutorId) {
        recipients.push({ userId: question.tutorId, role: 'tutor' });
      }
    } else if (isOwner) {
      if (question.tutorId) {
        recipients.push({ userId: question.tutorId, role: 'tutor' });
      }
    } else if (isAssignedTutor) {
      recipients.push({ userId: question.studentId, role: 'student' });
    }

    for (const recipient of recipients) {
      if (recipient.userId && recipient.userId.toString() !== req.userId) {
        await Notification.create({
          userId: recipient.userId,
          type: 'comment_added',
          title: `New comment on "${question.title}"`,
          message: `${user.fullName} (${user.role}): ${commentPreview}`,
          link: link
        });
      }
    }

    res.status(201).json(comment);
  } catch (err) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
      console.error('Comment post error:', err);
      console.error('File details:', {
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });
    } else {
      console.error('Comment post error (no file):', err);
    }
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

    comment.deleted = true;
    comment.deletedAt = new Date();
    await comment.save();

    res.json({ message: 'Comment deleted (admin can still see it)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;