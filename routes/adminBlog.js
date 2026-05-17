const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const path = require('path');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const BlogPost = require('../models/BlogPost');

const router = express.Router();

router.use(auth, roleCheck('admin'));

// Configure Cloudinary (should already be configured in server.js, but ensure it's ready)
// If Cloudinary is not already configured globally, uncomment the following lines:
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET
// });

// Multer memory storage for image uploads
const multerMemory = multer({ storage: multer.memoryStorage() });

// ========== IMAGE UPLOAD (for Quill editor) ==========
router.post('/upload-image', multerMemory.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // Upload to Cloudinary as image
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'studyglade/blog_images', resource_type: 'image' },
        (error, uploadResult) => {
          if (error) reject(error);
          else resolve(uploadResult);
        }
      ).end(req.file.buffer);
    });
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error('Image upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ========== Server‑rendered pages ==========
// List all posts (HTML)
router.get('/', async (req, res) => {
  try {
    const posts = await BlogPost.find().sort({ createdAt: -1 });
    res.render('admin-blog-list', { posts });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// New post form
router.get('/new', (req, res) => {
  res.render('admin-blog-form', { post: null, edit: false });
});

// Create post
router.post('/', async (req, res) => {
  try {
    const { title, content, excerpt, author, featuredImage, isPublished, publishedAt } = req.body;
    const post = new BlogPost({
      title,
      content,
      excerpt,
      author: author || 'StudyGlade Team',
      featuredImage,
      isPublished: isPublished === 'on' || isPublished === true,
      publishedAt: publishedAt ? new Date(publishedAt) : (isPublished ? new Date() : null)
    });
    await post.save();
    res.redirect('/admin/blog');
  } catch (err) {
    console.error(err);
    res.status(400).render('admin-blog-form', { post: req.body, edit: false, error: err.message });
  }
});

// Edit form
router.get('/:id/edit', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).send('Post not found');
    res.render('admin-blog-form', { post, edit: true });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Update post
router.put('/:id', async (req, res) => {
  try {
    const { title, content, excerpt, author, featuredImage, isPublished, publishedAt } = req.body;
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).send('Post not found');
    post.title = title;
    post.content = content;
    post.excerpt = excerpt;
    post.author = author;
    post.featuredImage = featuredImage;
    post.isPublished = isPublished === 'on' || isPublished === true;
    if (post.isPublished && !post.publishedAt) post.publishedAt = new Date();
    else if (!post.isPublished) post.publishedAt = null;
    else if (publishedAt) post.publishedAt = new Date(publishedAt);
    await post.save();
    res.redirect('/admin/blog');
  } catch (err) {
    console.error(err);
    res.status(400).send('Error updating post');
  }
});

// Delete post (supports both JSON (fetch) and HTML (redirect))
router.delete('/:id', async (req, res) => {
  try {
    await BlogPost.findByIdAndDelete(req.params.id);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.json({ message: 'Post deleted successfully' });
    } else {
      res.redirect('/admin/blog');
    }
  } catch (err) {
    console.error(err);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).send('Server error');
    }
  }
});

module.exports = router;