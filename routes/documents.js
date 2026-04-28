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

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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

router.post('/upload', auth, roleCheck('tutor', 'admin'), upload.single('file'), async (req, res) => {
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
    const doc = await Document.create({
      title,
      description,
      subject,
      subcategory,
      level,
      type,
      price: parseFloat(price),
      fileUrl: result.secure_url,
      uploaderId: req.userId,
      uploaderName: user.fullName,
      isApproved: user.role === 'admin' ? true : false,
      previewText,
      previewImageUrl
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { subject, level, type, search } = req.query;
    let filter = { isApproved: true };
    if (subject) filter.subject = subject;
    if (level) filter.level = level;
    if (type) filter.type = type;
    if (search) filter.title = { $regex: search, $options: 'i' };
    const docs = await Document.find(filter).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ UPDATED /unlock route: now updates seller's totalEarnings
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
    
    // Update tutor's total earnings (for dashboard)
    if (seller.role === 'tutor') {
      seller.tutorProfile.totalEarnings = (seller.tutorProfile.totalEarnings || 0) + sellerEarnings;
    }
    await seller.save();

    doc.downloads += 1;
    await doc.save();

    await Transaction.create({ userId: req.userId, type: 'unlock_document', amount: -doc.price, description: `Unlocked: ${doc.title}`, referenceId: doc._id });
    await Transaction.create({ userId: doc.uploaderId, type: 'tutor_payment', amount: sellerEarnings, description: `Document sale: ${doc.title}`, referenceId: doc._id });

    res.json({ message: 'Document unlocked', fileUrl: doc.fileUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(doc.title)} - StudyGlade</title>
        <meta name="description" content="${escapeHtml(doc.description?.substring(0, 160) || 'Academic document on ' + doc.subject)}">
        <link rel="stylesheet" href="/style.css">
        <script type="application/ld+json">${JSON.stringify(structuredData)}</script>
      </head>
      <body>
        <div class="container" style="max-width:800px; margin:2rem auto;">
          <div class="card">
            <h1>${escapeHtml(doc.title)}</h1>
            <p><strong>Subject:</strong> ${escapeHtml(doc.subject)} | <strong>Level:</strong> ${escapeHtml(doc.level)}</p>
            <p><strong>Type:</strong> ${escapeHtml(doc.type)} | <strong>Price:</strong> $${doc.price}</p>
            <p>${escapeHtml(doc.description || '')}</p>
            ${doc.previewImageUrl ? `<img src="${doc.previewImageUrl}" alt="Preview" style="max-width:100%; margin:1rem 0;">` : ''}
            <div class="preview-text" style="background:#f9f9f9; padding:1rem; border-left:4px solid #2563EB;">
              ${escapeHtml(doc.previewText || 'Preview not available.')}
            </div>
            <div style="text-align:center; margin-top:2rem;">
              <a href="/library" class="btn">Unlock full document for $${doc.price}</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

module.exports = router;