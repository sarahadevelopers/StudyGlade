const express = require('express');
const BlogPost = require('../models/BlogPost');
const marked = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const router = express.Router();
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

function renderMarkdown(content) {
  if (!content) return '';
  const rawHtml = marked.parse(content);
  return DOMPurify.sanitize(rawHtml);
}

// Blog listing (paginated)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const filter = { isPublished: true };
    const posts = await BlogPost.find(filter)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await BlogPost.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    // Auto-generate excerpt if missing
    posts.forEach(post => {
      if (!post.excerpt) {
        const plainText = post.content.replace(/[#*`>\[\]()!]/g, '').substring(0, 200);
        post.excerpt = plainText;
      }
    });

    res.render('blog', {
      posts,
      currentPage: page,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
      prevPage: page - 1,
      nextPage: page + 1
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Single blog post
router.get('/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug, isPublished: true });
    if (!post) return res.status(404).send('Post not found');

    post.htmlContent = renderMarkdown(post.content);

    // Related posts (latest 3)
    const relatedPosts = await BlogPost.find({ _id: { $ne: post._id }, isPublished: true })
      .sort({ publishedAt: -1 })
      .limit(3)
      .select('title slug');

    res.render('blog-post', { post, relatedPosts });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;