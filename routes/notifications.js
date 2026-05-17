const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');   // <-- added for admin check
const Notification = require('../models/Notification');

const router = express.Router();

// POST /api/notifications – create a notification (admin only)
router.post('/', auth, roleCheck('admin'), async (req, res) => {
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

// ----------------- POST: Create a notification (admin only) -----------------
router.post('/', auth, roleCheck('admin'), async (req, res) => {
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

    // Emit real‑time update via Socket.io if available
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${userId}`).emit('notification_new', notification);
    }

    res.status(201).json(notification);
  } catch (err) {
    console.error('Error creating notification:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------- GET user's notifications (latest first, paginated) -----------------
router.get('/', auth, async (req, res) => {
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

// ----------------- GET unread count (for bell badge) -----------------
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.userId, read: false });
    res.json({ count });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------- PUT: Mark a single notification as read -----------------
router.put('/:id/read', auth, async (req, res) => {
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

// ----------------- PUT: Mark all notifications as read -----------------
router.put('/read-all', auth, async (req, res) => {
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