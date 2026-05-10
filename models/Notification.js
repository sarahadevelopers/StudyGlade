const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null for admin-wide
  type: { 
    type: String, 
    enum: [
      'tutor_application',   // admin
      'withdrawal',          // admin
      'document_upload',     // admin
      'question_posted',     // student: tutor accepts or budget increased
      'user_suspended',      // admin
      'new_bid',             // student: tutor placed a bid
      'answer_uploaded',     // student: tutor uploaded answer or marked complete
      'funds_response'       // tutor: student responded to additional funds request
    ],
    required: true
  },
  title: { type: String },   // optional but used in your code
  message: String,
  link: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);