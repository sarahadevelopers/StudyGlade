const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { 
    type: String, 
    enum: [
      'tutor_application',
      'withdrawal',
      'document_upload',
      'question_posted',
      'user_suspended',
      'new_bid',
      'answer_uploaded',
      'funds_response',
      'comment_added'
    ],
    required: true
  },
  title: String,
  message: String,
  link: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// 👇 POST-SAVE HOOK – emits real‑time event via Socket.io
notificationSchema.post('save', async function(doc) {
  // Guard: if no userId, skip socket emit (but still save the notification)
  if (!doc.userId) {
    console.warn('⚠️ Notification saved without userId – skipping real-time emit. Type:', doc.type, 'Title:', doc.title);
    return;
  }
  try {
    if (global.io) {
      global.io.to(`user_${doc.userId}`).emit('notification_new', {
        id: doc._id,
        type: doc.type,
        title: doc.title,
        message: doc.message,
        link: doc.link,
        createdAt: doc.createdAt,
        read: doc.read
      });
      console.log(`🔔 Real-time notification sent to user ${doc.userId}`);
    } else {
      console.warn('⚠️ Socket.io not available – notification saved but not emitted');
    }
  } catch (err) {
    console.error('❌ Failed to emit notification via socket:', err);
  }
});

module.exports = mongoose.model('Notification', notificationSchema);