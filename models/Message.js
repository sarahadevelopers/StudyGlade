const mongoose = require('mongoose');
const messageSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false } // admin can see anyway
});
module.exports = mongoose.model('Message', messageSchema);