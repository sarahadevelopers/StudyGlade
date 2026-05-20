const { sendEmailWithTemplate } = require('../utils/email');
const jwt = require('jsonwebtoken');
const express = require('express');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const path = require('path');
const { body, param, query } = require('express-validator');
const { handleValidationErrors, sanitizeText, validateObjectId } = require('../middleware/validate');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const Document = require('../models/Document');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { upload } = require('../server');
const { emitToUser, getIO } = require('../utils/sockets');   // 👈 socket helper
const Notification = require('../models/Notification');

console.log('✅ documents.js loaded (final version with validation + sockets)');

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

function getResourceType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  return 'raw';
}

// Helper: extract preview text from PDF/DOCX/TXT
// Helper: extract preview text from PDF/DOCX/TXT with cleaning and fallback
async function extractPreviewText(filePath, originalName) {
  try {
    const ext = originalName.split('.').pop().toLowerCase();
    let rawText = '';

    if (ext === 'pdf') {
      const pdfParse = require('pdf-parse');
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      rawText = data.text;
    } else if (ext === 'docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      rawText = result.value;
    } else if (ext === 'txt') {
      rawText = await fs.readFile(filePath, 'utf8');
    } else {
      // For unsupported types, return a generic message
      return 'Preview not available. Unlock to access the full document.';
    }

    // Remove non‑printable characters (ASCII control codes 0-31, 127-159)
    const cleanText = rawText.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    
    // Check if the cleaned text is readable (contains at least some letters/words)
    const readableChars = (cleanText.match(/[a-zA-Z0-9\s]/g) || []).length;
    if (cleanText.trim().length < 50 || readableChars < cleanText.length * 0.5) {
      console.warn(`Preview text for ${originalName} seems unreadable (${readableChars}/${cleanText.length} readable chars). Using fallback.`);
      return 'Preview not available. Unlock to see the full document.';
    }

    // Truncate to 500 characters
    return cleanText.substring(0, 500) + (cleanText.length > 500 ? '...' : '');
  } catch (err) {
    console.error('Preview extraction error:', err);
    return 'Preview not available. Unlock to access the complete document.';
  }
}

let previewText = await extractPreviewText(req.file.path, req.file.originalname);

// Final safeguard – if the preview is still too short or mostly non‑alphanumeric, replace it
if (!previewText || previewText.length < 20 || previewText.replace(/[a-zA-Z0-9\s.,!?]/g, '').length > previewText.length * 0.5) {
  previewText = 'Preview not available. Unlock to see the full document.';
} 

// ========== TEST ENDPOINTS ==========
router.get('/test', (req, res) => {
  res.json({ status: 'OK', message: 'Documents route alive' });
});
router.get('/test2', (req, res) => {
  res.json({ message: 'test2 works' });
});

// ========== LIBRARY ENDPOINT (with validation for query params) ==========
router.get('/library', 
  [
    query('subject').optional().trim().escape(),
    query('level').optional().trim().escape(),
    query('type').optional().trim().escape(),
    query('search').optional().trim().escape(),
    query('minPrice').optional().isFloat({ min: 0 }).withMessage('Invalid min price'),
    query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Invalid max price'),
    query('sort').optional().isIn(['newest', 'price_asc', 'price_desc', 'popular']).withMessage('Invalid sort'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  handleValidationErrors,
  async (req, res) => {
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
  }
);

// ========== UPLOAD DOCUMENT ==========
// ========== UPLOAD DOCUMENT (with admin notifications) ==========
router.post('/upload', 
  auth,
  roleCheck('tutor', 'admin'),
  upload.single('file'),
  [
    sanitizeText('title').isLength({ min: 3, max: 100 }).withMessage('Title must be 3-100 characters'),
    sanitizeText('description').isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
    sanitizeText('subject').notEmpty().withMessage('Subject is required'),
    sanitizeText('subcategory').optional(),
    sanitizeText('level').notEmpty().withMessage('Level is required'),
    sanitizeText('type').notEmpty().withMessage('Type is required'),
    body('price').isFloat({ min: 0.5 }).withMessage('Price must be at least $0.50')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { title, description, subject, subcategory, level, type, price } = req.body;
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const resourceType = getResourceType(req.file.mimetype);
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'studyglade/documents',
        resource_type: resourceType
      });
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

      // ✅ NEW: Notify all admins about new document upload (if not auto‑approved)
      if (user.role !== 'admin') {  // only for tutor‑uploaded documents
        try {
          const admins = await User.find({ role: 'admin' });
          const io = getIO(req);
          for (const admin of admins) {
            await Notification.create({
              userId: admin._id,
              type: 'document_upload',
              title: 'New Document Upload',
              message: `${user.fullName} uploaded "${title}" – pending approval.`,
              link: '/admin-dashboard.html?section=documents',
              read: false
            });
            if (io) {
              io.to(`user_${admin._id}`).emit('notification_new', {
                message: `${user.fullName} uploaded new document`
              });
            }
          }
          console.log(`📢 Notified ${admins.length} admin(s) about new document upload`);
        } catch (notifErr) {
          console.error('Failed to notify admins about document upload:', notifErr);
          // Do not block the upload
        }
      }

      res.status(201).json(doc);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  }
);

// ========== UNLOCK DOCUMENT (with socket events) ==========
router.post('/:id/unlock',
  auth,
  validateObjectId('id'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const doc = await Document.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      const user = await User.findById(req.userId);
      if (user.walletBalance < doc.price) return res.status(400).json({ error: 'Insufficient wallet balance' });

      // Deduct from buyer
      user.walletBalance -= doc.price;
      await user.save();

      // Pay seller 65%
      const seller = await User.findById(doc.uploaderId);
      const sellerEarnings = doc.price * 0.65;
      seller.walletBalance += sellerEarnings;
      if (seller.role === 'tutor') {
        seller.tutorProfile.totalEarnings = (seller.tutorProfile.totalEarnings || 0) + sellerEarnings;
      }
      await seller.save();

      doc.downloads += 1;
      await doc.save();

      // Record transactions
      await Transaction.create({
        userId: req.userId, type: 'unlock_document', amount: -doc.price,
        description: `Unlocked: ${doc.title}`, referenceId: doc._id
      });
      await Transaction.create({
        userId: doc.uploaderId, type: 'tutor_payment', amount: sellerEarnings,
        description: `Document sale: ${doc.title}`, referenceId: doc._id
      });

      // Fire-and-forget emails
      sendEmailWithTemplate(user.email, 'Document Unlocked – StudyGlade', 'document-unlocked.ejs', {
        studentName: user.fullName,
        documentTitle: doc.title,
        documentPrice: doc.price,
        downloadUrl: doc.fileUrl
      }).catch(err => console.error('Failed to send unlock email:', err));

      sendEmailWithTemplate(seller.email, 'Payment Received – StudyGlade', 'tutor-payment.ejs', {
        tutorName: seller.fullName,
        amount: sellerEarnings,
        reason: `Document sale: ${doc.title}`
      }).catch(err => console.error('Failed to send tutor payment email:', err));

      // ✅ Socket events
      const io = getIO(req);
      
      emitToUser(io, req.userId, 'wallet_update', {
        newBalance: user.walletBalance,
        transaction: { amount: -doc.price, type: 'unlock_document' }
      });
      emitToUser(io, req.userId, 'document_unlocked', {
        documentId: doc._id,
        documentTitle: doc.title,
        fileUrl: doc.fileUrl,
        price: doc.price
      });

      emitToUser(io, doc.uploaderId, 'wallet_update', {
        newBalance: seller.walletBalance,
        transaction: { amount: sellerEarnings, type: 'document_sale' }
      });
      emitToUser(io, doc.uploaderId, 'document_sold', {
        documentId: doc._id,
        documentTitle: doc.title,
        earnings: sellerEarnings,
        buyerName: user.fullName
      });

      res.json({ message: 'Document unlocked', fileUrl: doc.fileUrl });
    } catch (err) {
      console.error('Unlock error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ========== PREVIEW (SEO) – FULL HTML PAGE ==========
router.get('/preview/:id', 
  param('id').isMongoId().withMessage('Invalid document ID'),
  handleValidationErrors,
  async (req, res) => {
    // ... (unchanged, too long but keep exactly as you had)
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

      let user = null;
      const token = req.cookies.accessToken;
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          user = await User.findById(decoded.id).select('-password');
        } catch (err) {}
      }

      const fullText = doc.previewText || 'Preview not available.';
      const teaserLength = 180;
      const teaser = fullText.substring(0, teaserLength);
      const remainder = fullText.substring(teaserLength);
      const showBlur = remainder.length > 0;

      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>${escapeHtml(doc.title)} - StudyGlade</title>
          <meta name="description" content="${escapeHtml(doc.description?.substring(0, 160) || 'Academic document on ' + doc.subject)}">
          <meta property="og:title" content="${escapeHtml(doc.title)}">
          <meta property="og:description" content="${escapeHtml(doc.description?.substring(0, 160) || 'Academic document on ' + doc.subject)}">
          <meta property="og:image" content="${escapeHtml(doc.previewImageUrl)}">
          <meta name="twitter:card" content="summary_large_image">
          <link rel="canonical" href="https://studyglade.com/document/${doc.slug}">
          <script type="application/ld+json">${JSON.stringify(structuredData)}</script>
          <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { font-family:'Inter',sans-serif; background:linear-gradient(135deg,#f8fafc,#eef2f6); min-height:100vh; padding:2rem 1rem; }
            .container { max-width:1280px; margin:0 auto; }
            .document-grid { display:grid; grid-template-columns:1fr 380px; gap:2rem; }
            @media (max-width:900px){ .document-grid{ grid-template-columns:1fr; gap:1.5rem; } }
            .card { background:#fff; border-radius:32px; box-shadow:0 20px 35px -12px rgba(0,0,0,0.1); overflow:hidden; }
            .card-content { padding:2rem; }
            .sidebar-card { position:sticky; top:2rem; }
            h1 { font-size:2rem; font-weight:700; margin-bottom:1rem; color:#0a0c10; }
            .badge-group { display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:1.5rem; }
            .badge { background:#eef2ff; color:#1e40af; padding:0.25rem 0.75rem; border-radius:40px; font-size:0.75rem; font-weight:500; }
            .description { color:#334155; margin-bottom:1.5rem; }
            .preview-img { width:100%; border-radius:20px; margin:1.5rem 0; border:1px solid #e9edf2; }
            .preview-content { background:#fafcff; border-radius:24px; padding:1.5rem; border:1px solid #eef2f8; line-height:1.6; color:#1e293b; }
            .blurred-text { filter:blur(5px); user-select:none; }
            .preview-overlay { margin-top:1rem; padding:1rem; background:#f1f5f9; border-radius:20px; text-align:center; border:1px solid #e2e8f0; }
            .btn-small { background:#fff; border:1px solid #cbd5e1; padding:0.5rem 1rem; border-radius:40px; cursor:pointer; text-decoration:none; display:inline-block; font-size:0.8rem; }
            .btn-primary { display:block; width:100%; background:#3b82f6; color:white; border:none; padding:1rem; border-radius:60px; cursor:pointer; text-align:center; font-weight:600; transition:0.2s; }
            .btn-primary:hover { background:#2563eb; transform:translateY(-1px); }
            .price-box { background:#f8fafc; border-radius:24px; padding:1rem; text-align:center; }
            .price-value { font-size:2.8rem; font-weight:800; color:#0f172a; }
            .trust-badges { display:flex; justify-content:center; gap:1rem; margin-top:1rem; font-size:0.7rem; color:#5b6e8c; }
            footer { text-align:center; margin-top:3rem; font-size:0.75rem; color:#6c7a91; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="document-grid">
              <div class="card">
                <div class="card-content">
                  <h1>${escapeHtml(doc.title)}</h1>
                  <div class="badge-group">
                    <span class="badge">${escapeHtml(doc.subject)}</span>
                    <span class="badge">${escapeHtml(doc.level)}</span>
                    <span class="badge">${escapeHtml(doc.type)}</span>
                  </div>
                  <p class="description">${escapeHtml(doc.description || 'No description provided.')}</p>
                  ${doc.previewImageUrl ? `<img class="preview-img" src="${escapeHtml(doc.previewImageUrl)}" alt="Document preview">` : ''}
                  <div class="preview-content">
                    <div>${escapeHtml(teaser)}${showBlur ? `<span class="blurred-text">${escapeHtml(remainder)}</span>` : ''}</div>
                    ${showBlur ? `
                      <div class="preview-overlay">
                        ${!user ? `
                          <p>✨ Unlock the full document to read all ${fullText.length} characters, plus the complete file.</p>
                          <a href="/register?returnTo=/document/${doc.slug}" class="btn-small">Sign up to unlock</a>
                          <a href="/login?returnTo=/document/${doc.slug}" style="display:inline-block; margin-left:0.5rem; font-size:0.8rem;">Log in</a>
                        ` : `
                          <p>🔒 The full preview is hidden. Unlock to access the complete document.</p>
                          <button id="unlockFromPreviewBtn" class="btn-small">Unlock full document</button>
                        `}
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>
              <div class="sidebar-card">
                <div class="card">
                  <div class="card-content">
                    <div class="price-box">
                      <div class="price-value">$${doc.price.toFixed(2)}<span> USD</span></div>
                    </div>
                    ${!user ? `
                      <a href="/register?returnTo=/document/${doc.slug}" class="btn-primary">🔓 Unlock & Download</a>
                      <a href="/login?returnTo=/document/${doc.slug}" style="display:block; margin-top:0.5rem; text-align:center;">Log in</a>
                    ` : `
                      <button id="unlockBtn" class="btn-primary">🔓 Unlock for $${doc.price.toFixed(2)}</button>
                      <div id="message"></div>
                    `}
                    <div class="trust-badges">
                      <span>✅ Instant access</span>
                      <span>💳 Secure payment</span>
                      <span>🔄 7‑day refund policy</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <footer>© StudyGlade — Academic knowledge shared securely</footer>
          </div>
          ${user ? `
          <script>
            document.addEventListener('DOMContentLoaded', function() {
              const unlockBtn = document.getElementById('unlockBtn');
              const previewUnlockBtn = document.getElementById('unlockFromPreviewBtn');
              async function handleUnlock() {
                const btn = unlockBtn || previewUnlockBtn;
                if (!btn) return;
                btn.disabled = true;
                btn.innerText = 'Processing...';
                try {
                  const response = await fetch('/api/documents/${doc._id}/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
                  const data = await response.json();
                  if (response.ok) {
                    document.getElementById('message').innerHTML = '<span style="color:#059669;">✓ Unlocked! <a href="' + data.fileUrl + '" target="_blank">Download now</a></span>';
                    if (unlockBtn) unlockBtn.style.display = 'none';
                    if (previewUnlockBtn) previewUnlockBtn.style.display = 'none';
                  } else {
                    document.getElementById('message').innerHTML = '<span style="color:#dc2626;">' + (data.error || 'Insufficient balance.') + ' <a href="/student-dashboard.html?returnTo=' + encodeURIComponent(window.location.pathname) + '">Add funds now</a></span>';
                    btn.disabled = false;
                    btn.innerText = 'Unlock';
                  }
                } catch (err) {
                  document.getElementById('message').innerHTML = '<span style="color:#dc2626;">Network error. Try again.</span>';
                  btn.disabled = false;
                  btn.innerText = 'Unlock';
                }
              }
              if (unlockBtn) unlockBtn.addEventListener('click', handleUnlock);
              if (previewUnlockBtn) previewUnlockBtn.addEventListener('click', handleUnlock);
            });
          </script>
          ` : ''}
        </body>
        </html>
      `;
      res.send(html);
    } catch (err) {
      console.error('Preview error:', err);
      res.status(500).send('Server error');
    }
  }
);

// ========== SMART PREVIEW (sentence extraction) ==========
router.post('/smart-preview/:id',
  param('id').isMongoId().withMessage('Invalid document ID'),
  body('query').trim().escape().notEmpty().withMessage('Query required'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { query } = req.body;
      const doc = await Document.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document not found' });

      if (!doc.previewText || doc.previewText.length < 20) {
        return res.json({ snippet: 'No readable preview available for this document.', hasMatch: false });
      }

      const { segment } = require('sentencex');

      const previewLower = doc.previewText.toLowerCase();
      const queryLower = query.toLowerCase();
      let matchIndex = previewLower.indexOf(queryLower);
      if (matchIndex === -1) {
        const keywords = queryLower.split(/\s+/);
        for (const word of keywords) {
          if (word.length > 3 && previewLower.includes(word)) {
            matchIndex = previewLower.indexOf(word);
            break;
          }
        }
      }

      let contextualSnippet = "";
      if (matchIndex !== -1) {
        const sentences = segment(doc.previewText);
        for (const sentence of sentences) {
          if (sentence.toLowerCase().includes(queryLower)) {
            contextualSnippet += sentence + " ";
          }
        }
        if (!contextualSnippet) {
          const start = Math.max(0, matchIndex - 100);
          const end = Math.min(doc.previewText.length, matchIndex + 200);
          contextualSnippet = "..." + doc.previewText.substring(start, end) + "...";
        }
      } else {
        contextualSnippet = doc.previewText.substring(0, 300);
      }

      contextualSnippet = contextualSnippet.trim();
      if (contextualSnippet.length > 500) {
        contextualSnippet = contextualSnippet.substring(0, 500) + '...';
      }

      res.json({ snippet: contextualSnippet, hasMatch: matchIndex !== -1 });
    } catch (err) {
      console.error('Smart preview error:', err);
      res.status(500).json({ error: 'Failed to generate preview' });
    }
  }
);

// ========== ADMIN: UPDATE PREVIEW TEXT ==========
router.put('/:id/preview',
  auth,
  roleCheck('admin'),
  param('id').isMongoId().withMessage('Invalid document ID'),
  body('previewText').trim().escape().isLength({ max: 500 }).withMessage('Preview text cannot exceed 500 characters'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { previewText } = req.body;
      const doc = await Document.findByIdAndUpdate(req.params.id, { previewText: previewText.substring(0, 500) }, { new: true });
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      res.json({ message: 'Preview text updated', previewText: doc.previewText });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;