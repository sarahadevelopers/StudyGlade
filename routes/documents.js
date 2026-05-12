const jwt = require('jsonwebtoken');
const express = require('express');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const path = require('path');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const Document = require('../models/Document');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { upload } = require('../server');

console.log('✅ documents.js loaded (final version)');

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// Helper: lazy‑load PDF/DOCX parsers
async function extractPreviewText(filePath, originalName) {
  try {
    const ext = originalName.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      const pdfParse = require('pdf-parse');
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text.substring(0, 500) + '...';
    } else if (ext === 'docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value.substring(0, 500) + '...';
    } else {
      const content = await fs.readFile(filePath, 'utf8');
      return content.replace(/<[^>]*>/g, '').substring(0, 500) + '...';
    }
  } catch (err) {
    console.error('Preview extraction error:', err);
    return 'Preview not available.';
  }
}

// ========== TEST ENDPOINTS ==========
router.get('/test', (req, res) => {
  res.json({ status: 'OK', message: 'Documents route alive' });
});
router.get('/test2', (req, res) => {
  res.json({ message: 'test2 works' });
});

// ========== MAIN GET – ALWAYS RETURNS JSON ==========
// ========== DEDICATED LIBRARY ENDPOINT (used by frontend) ==========
router.get('/library', async (req, res) => {
  console.log('📚 GET /api/documents/library called');
  try {
    let userId = null;
    const token = req.cookies.accessToken;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
      } catch (err) {}
    }

    let filter = {};
    if (userId) {
      filter.$or = [{ isApproved: true }, { uploaderId: userId }];
    } else {
      filter.isApproved = true;
    }

    const { subject, level, type, search, minPrice, maxPrice, sort = 'newest', page = 1, limit = 20 } = req.query;
    if (subject) filter.subject = subject;
    if (level) filter.level = level;
    if (type) filter.type = type;
    if (search) filter.title = { $regex: search, $options: 'i' };
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    let sortOption = { createdAt: -1 };
    switch (sort) {
      case 'price_asc': sortOption = { price: 1 }; break;
      case 'price_desc': sortOption = { price: -1 }; break;
      case 'popular': sortOption = { downloads: -1 }; break;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const docs = await Document.find(filter)
      .select('title description subject level type price slug previewImageUrl downloads createdAt uploaderName uploaderId isApproved')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);
    const total = await Document.countDocuments(filter);

    // Fallback for missing slug
    const processedDocs = docs.map(doc => ({
      ...doc.toObject(),
      slug: doc.slug || doc._id.toString()
    }));

    res.json({
      documents: processedDocs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('❌ Library endpoint error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ========== UPLOAD ==========
router.post('/upload', auth, roleCheck('tutor', 'admin'), upload.single('file'), async (req, res) => {
  // [your existing upload code – unchanged]
  try {
    const { title, description, subject, subcategory, level, type, price } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const result = await cloudinary.uploader.upload(req.file.path, { folder: 'studyglade/documents' });
    const previewText = await extractPreviewText(req.file.path, req.file.originalname);
    let previewImageUrl = '';
    if (req.file.mimetype === 'application/pdf') {
      const imgResult = await cloudinary.uploader.upload(req.file.path, {
        folder: 'studyglade/previews',
        pages: true,
        transformation: [{ page: 1, format: 'jpg' }]
      });
      previewImageUrl = imgResult.secure_url;
    }
    await fs.unlink(req.file.path);

    const user = await User.findById(req.userId);
    let baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = baseSlug;
    let counter = 1;
    while (await Document.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const doc = await Document.create({
      title, description, subject, subcategory, level, type,
      price: parseFloat(price),
      fileUrl: result.secure_url,
      uploaderId: req.userId,
      uploaderName: user.fullName,
      isApproved: user.role === 'admin' ? true : false,
      previewText, previewImageUrl, slug
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// ========== UNLOCK ==========
router.post('/:id/unlock', auth, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const user = await User.findById(req.userId);
    if (user.walletBalance < doc.price) return res.status(400).json({ error: 'Insufficient wallet balance' });

    user.walletBalance -= doc.price;
    await user.save();

    const seller = await User.findById(doc.uploaderId);
    const sellerEarnings = doc.price * 0.65;
    seller.walletBalance += sellerEarnings;
    if (seller.role === 'tutor') {
      seller.tutorProfile.totalEarnings = (seller.tutorProfile.totalEarnings || 0) + sellerEarnings;
    }
    await seller.save();

    doc.downloads += 1;
    await doc.save();

    await Transaction.create({
      userId: req.userId, type: 'unlock_document', amount: -doc.price,
      description: `Unlocked: ${doc.title}`, referenceId: doc._id
    });
    await Transaction.create({
      userId: doc.uploaderId, type: 'tutor_payment', amount: sellerEarnings,
      description: `Document sale: ${doc.title}`, referenceId: doc._id
    });

    res.json({ message: 'Document unlocked', fileUrl: doc.fileUrl });
  } catch (err) {
    console.error('Unlock error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== PREVIEW (SEO) ==========
router.get('/preview/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).send('Document not found');
    if (!doc.isApproved && !req.query.admin) return res.status(404).send('Document not available');

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      "name": doc.title,
      "description": doc.description || `Study notes on ${doc.subject}`,
      "educationalLevel": doc.level,
      "learningResourceType": doc.type,
      "creator": { "@type": "Person", "name": doc.uploaderName },
      "offers": { "@type": "Offer", "price": doc.price, "priceCurrency": "USD" }
    };

    const html = `...`; // keep your existing HTML (truncated for brevity)
    res.send(html);
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).send('Server error');
  }
});

// ========== SMART PREVIEW ==========
router.post('/smart-preview/:id', async (req, res) => {
  try {
    const { query } = req.body;
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (!doc.previewText || doc.previewText.length < 20) {
      return res.json({ snippet: 'No readable preview available.', hasMatch: false });
    }
    const { segment } = require('sentencex');
    // ... (rest of your smart‑preview logic)
    res.json({ snippet: '...', hasMatch: true });
  } catch (err) {
    console.error('Smart preview error:', err);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// ========== ADMIN UPDATE PREVIEW ==========
router.put('/:id/preview', auth, roleCheck('admin'), async (req, res) => {
  try {
    const { previewText } = req.body;
    if (typeof previewText !== 'string') return res.status(400).json({ error: 'previewText must be a string' });
    const doc = await Document.findByIdAndUpdate(req.params.id, { previewText: previewText.substring(0, 500) }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json({ message: 'Preview text updated', previewText: doc.previewText });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;