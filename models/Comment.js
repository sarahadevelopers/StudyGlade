const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userRole: { type: String, enum: ['student', 'tutor', 'admin'], required: true },
  userName: { type: String, required: true },
  text: { type: String, default: '' },                     // text is now optional (file can be provided instead)
  fileUrl: { type: String, default: null },               // URL of attached file (if any)
  createdAt: { type: Date, default: Date.now },
  isEdited: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null }
});

module.exports = mongoose.model('Comment', commentSchema);