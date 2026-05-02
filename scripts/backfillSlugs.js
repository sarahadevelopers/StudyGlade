require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Document = require('../models/Document');

async function backfillSlugs() {
  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI is not defined in .env file');
    }
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('Connected successfully');

    // Find documents without slug OR with null/empty slug
    const documents = await Document.find({
      $or: [
        { slug: { $exists: false } },
        { slug: null },
        { slug: '' }
      ]
    });
    console.log(`Found ${documents.length} documents without slug`);

    for (const doc of documents) {
      let baseSlug = doc.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      
      let slug = baseSlug;
      let counter = 1;
      
      // Check uniqueness across ALL documents (including those with slug already)
      while (await Document.findOne({ slug, _id: { $ne: doc._id } })) {
        slug = `${baseSlug}-${counter++}`;
      }
      
      doc.slug = slug;
      await doc.save();
      console.log(`✅ Updated: "${doc.title.substring(0, 50)}" → ${slug}`);
    }

    console.log('Backfill complete');
    process.exit(0);
  } catch (err) {
    console.error('Error during backfill:', err);
    process.exit(1);
  }
}

backfillSlugs();