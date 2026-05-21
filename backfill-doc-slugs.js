require('dotenv').config();
const mongoose = require('mongoose');
const Document = require('./models/Document');

const slugify = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  console.log('Connected to MongoDB');
  
  // Find all documents that have no slug or empty slug
  const docs = await Document.find({ $or: [{ slug: null }, { slug: '' }] });
  console.log(`Found ${docs.length} documents without a slug.`);
  
  for (const doc of docs) {
    let base = doc.title || doc._id.toString();
    let slug = slugify(base);
    let unique = slug;
    let count = 1;
    // Ensure uniqueness
    while (await Document.findOne({ slug: unique, _id: { $ne: doc._id } })) {
      unique = `${slug}-${count++}`;
    }
    doc.slug = unique;
    await doc.save();
    console.log(`✅ ${doc.title} → ${unique}`);
  }
  
  console.log('Done.');
  process.exit();
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});