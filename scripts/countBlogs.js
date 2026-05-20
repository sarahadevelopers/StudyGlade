// scripts/countBlogs.js
require('dotenv').config();
const mongoose = require('mongoose');
const BlogPost = require('../models/BlogPost');

async function countBlogs() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const total = await BlogPost.countDocuments();
    const published = await BlogPost.countDocuments({ isPublished: true });
    const drafts = await BlogPost.countDocuments({ isPublished: false });

    console.log(`📊 Total blog posts: ${total}`);
    console.log(`✅ Published: ${published}`);
    console.log(`📝 Drafts: ${drafts}`);

    if (total > 0) {
      console.log('\n📋 All post titles:');
      const posts = await BlogPost.find().select('title isPublished').sort({ createdAt: -1 });
      posts.forEach(p => console.log(` - ${p.title} [${p.isPublished ? 'PUBLISHED' : 'DRAFT'}]`));
    } else {
      console.log('No blog posts found.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

countBlogs();