const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const path = require('path');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const Document = require('../models/Document');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ dest: 'uploads/' });

// Helper: Extract preview text from file
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
      // For text files, HTML, etc.
      const content = await fs.readFile(filePath, 'utf8');
      return content.replace(/<[^>]*>/g, '').substring(0, 500) + '...';
    }
  } catch (err) {
    console.error('Preview extraction error:', err);
    return 'Preview not available.';
  }
}

// Upload document (tutor or admin)
router.post('/upload', auth, roleCheck('tutor', 'admin'), upload.single('file'), async (req, res) => {
  try {
    const { title, description, subject, subcategory, level, type, price } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // 1. Upload original file to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, { folder: 'studyglade/documents' });

    // 2. Generate preview text
    const previewText = await extractPreviewText(req.file.path, req.file.originalname);

    // 3. For PDFs, also generate a preview image (first page)
    let previewImageUrl = '';
    if (req.file.mimetype === 'application/pdf') {
      const imgResult = await cloudinary.uploader.upload(req.file.path, {
        folder: 'studyglade/previews',
        pages: true,
        transformation: [{ page: 1, format: 'jpg' }]
      });
      previewImageUrl = imgResult.secure_url;
    }

    // 4. Clean up temporary file
    await fs.unlink(req.file.path);

    // 5. Save document to database
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

// Get all approved documents (for library)
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

// Unlock document (purchase)
router.post('/:id/unlock', auth, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const user = await User.findById(req.userId);
    if (user.walletBalance < doc.price) return res.status(400).json({ error: 'Insufficient wallet balance' });

    // Deduct from buyer
    user.walletBalance -= doc.price;
    await user.save();

    // Pay seller 65% of price
    const seller = await User.findById(doc.uploaderId);
    const sellerEarnings = doc.price * 0.65;
    seller.walletBalance += sellerEarnings;
    await seller.save();

    // Increment downloads
    doc.downloads += 1;
    await doc.save();

    // Record transactions
    await Transaction.create({ userId: req.userId, type: 'unlock_document', amount: -doc.price, description: `Unlocked: ${doc.title}`, referenceId: doc._id });
    await Transaction.create({ userId: doc.uploaderId, type: 'tutor_payment', amount: sellerEarnings, description: `Document sale: ${doc.title}`, referenceId: doc._id });

    res.json({ message: 'Document unlocked', fileUrl: doc.fileUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🆕 PUBLIC PREVIEW ROUTE (SEO friendly, no login required)
router.get('/preview/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).send('Document not found');
    if (!doc.isApproved && !req.query.admin) {
      return res.status(404).send('Document not available');
    }

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      "name": doc.title,
      "description": doc.description || `Study notes on ${doc.subject}`,
      "educationalLevel": doc.level,
      "learningResourceType": doc.type,
      "creator": { "@type": "Person", "name": doc.uploaderName },
      "offers": {
        "@type": "Offer",
        "price": doc.price,
        "priceCurrency": "USD"
      }
    };

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(doc.title)} - StudyGlade</title>
        <meta name="description" content="${escapeHtml(doc.description?.substring(0, 160) || 'Academic document on ' + doc.subject)}">
        <meta name="robots" content="index, follow">
        <link rel="canonical" href="https://studyglade.onrender.com/api/documents/preview/${doc._id}">
        <link rel="stylesheet" href="/style.css">
        <script type="application/ld+json">${JSON.stringify(structuredData)}</script>
      </head>
      <body>
        <div class="container" style="max-width: 800px; margin: 2rem auto;">
          <div class="card">
            <h1>${escapeHtml(doc.title)}</h1>
            <p><strong>Subject:</strong> ${escapeHtml(doc.subject)} | <strong>Level:</strong> ${escapeHtml(doc.level)}</p>
            <p><strong>Type:</strong> ${escapeHtml(doc.type)} | <strong>Price:</strong> $${doc.price}</p>
            <p>${escapeHtml(doc.description || '')}</p>
            ${doc.previewImageUrl ? `<img src="${doc.previewImageUrl}" alt="Preview of ${escapeHtml(doc.title)}" style="max-width:100%; border:1px solid #ddd; margin:1rem 0;">` : ''}
            <div class="preview-text" style="background:#f9f9f9; padding:1rem; margin:1rem 0; border-left:4px solid #2563EB;">
              ${escapeHtml(doc.previewText || 'Preview not available.')}
            </div>
            <div class="cta" style="text-align:center; margin-top:2rem;">
              <a href="/library" class="btn">Unlock full document for $${doc.price}</a>
            </div>
            <p style="margin-top:2rem; font-size:0.9rem;">StudyGlade – Get academic help, fast and secure.</p>
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

// Simple XSS helper
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

module.exports = router;