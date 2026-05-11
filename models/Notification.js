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
      'comment_added'   // 👈 added for chat notifications
    ],
    required: true
  },
  title: String,
  message: String,
  link: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);