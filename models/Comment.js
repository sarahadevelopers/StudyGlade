const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userRole: { type: String, enum: ['student', 'tutor', 'admin'], required: true },
  userName: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  isEdited: { type: Boolean, default: false }
});

module.exports = mongoose.model('Comment', commentSchema);