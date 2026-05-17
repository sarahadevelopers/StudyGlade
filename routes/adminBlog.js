const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const BlogPost = require('../models/BlogPost');

const router = express.Router();

router.use(auth, roleCheck('admin'));

// ========== JSON API for admin dashboard ==========
// IMPORTANT: This route must come BEFORE any parameterized routes (e.g., /:id/edit)
router.get('/posts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const posts = await BlogPost.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await BlogPost.countDocuments();

    res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
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