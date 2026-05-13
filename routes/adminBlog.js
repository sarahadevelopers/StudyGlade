const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const BlogPost = require('../models/BlogPost');

const router = express.Router();

router.use(auth, roleCheck('admin'));

// List all posts
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

// Delete post
router.delete('/:id', async (req, res) => {
  try {
    await BlogPost.findByIdAndDelete(req.params.id);
    res.redirect('/admin/blog');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;