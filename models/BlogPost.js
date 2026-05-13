const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true, index: true },
  content: { type: String, required: true }, // Markdown content
  excerpt: { type: String, default: '' },
  author: { type: String, default: 'StudyGlade Team' },
  featuredImage: { type: String, default: '' },
  isPublished: { type: Boolean, default: false },
  publishedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

blogPostSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Auto-generate slug from title if not provided
blogPostSchema.pre('validate', async function(next) {
  if (!this.slug && this.title) {
    let baseSlug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    let slug = baseSlug;
    let counter = 1;
    while (await mongoose.model('BlogPost').findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }
    this.slug = slug;
  }
  next();
});

module.exports = mongoose.model('BlogPost', blogPostSchema);