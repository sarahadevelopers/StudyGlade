const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  subject: String,
  subcategory: String,
  level: { type: String, enum: ['High School', 'College', 'Masters', 'PhD'] },
  type: { type: String, enum: ['Notes', 'Assignment', 'Exam Prep', 'Guide', 'Template'] },
  price: { type: Number, required: true, min: 0 },
  fileUrl: { type: String, required: true },
  uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploaderName: String,
  downloads: { type: Number, default: 0 },
  isApproved: { type: Boolean, default: false },
  previewText: { type: String, default: '' },        // first 500 characters
  previewImageUrl: { type: String, default: '' },    // first page as image (PDFs)
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Document', documentSchema);