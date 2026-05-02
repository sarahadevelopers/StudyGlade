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
  previewText: { type: String, default: '' },
  previewImageUrl: { type: String, default: '' },
  slug: { type: String, required: true, unique: true, index: true }, // ✅ ADD THIS
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Auto-generate slug before saving (if not provided)
documentSchema.pre('save', async function(next) {
  if (!this.slug && this.title) {
    let baseSlug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    let slug = baseSlug;
    let counter = 1;
    while (await mongoose.model('Document').findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter++}`;
    }
    this.slug = slug;
  }
  next();
});

module.exports = mongoose.model('Document', documentSchema);