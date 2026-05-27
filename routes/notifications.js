const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const Notification = require('../models/Notification');

const router = express.Router();

// ========== PUBLIC ROUTES (no authentication required) ==========
// GET unread count for the bell badge – works even if user is not logged in
router.get('/unread-count', async (req, res) => {
  try {
    // Attempt to get user from access token cookie
    let userId = null;
    const token = req.cookies.accessToken;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
      } catch (err) {
        // Invalid token – treat as not logged in
      }
    }
    const count = userId ? await Notification.countDocuments({ userId, read: false }) : 0;
    res.json({ count });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ error: 'Failed to fetch count' });
  }
});

// ========== ALL ROUTES BELOW REQUIRE AUTHENTICATION ==========
router.use(auth);

// POST – create a notification (admin only)
router.post('/', roleCheck('admin'), async (req, res) => {
  try {
    const { userId, type, title, message, link } = req.body;
    if (!userId || !title || !message) {
      return res.status(400).json({ error: 'Missing required fields: userId, title, message' });
    }
    const notification = await Notification.create({
      userId,
      type: type || 'admin_test',
      title,
      message,
      link: link || '/admin-dashboard.html',
      read: false
    });
    const io = req.app.get('io');
    if (io) io.to(`user_${userId}`).emit('notification_new', notification);
    res.status(201).json(notification);
  } catch (err) {
    console.error('Error creating notification:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET user's notifications (paginated)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments({ userId: req.userId });

    res.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT – mark a single notification as read
router.put('/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT – mark all notifications as read
router.put('/read-all', async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.userId, read: false },
      { read: true }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;