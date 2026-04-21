const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
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

// Upload document (tutor or admin only)
router.post('/upload', auth, roleCheck('tutor', 'admin'), upload.single('file'), async (req, res) => {
  try {
    const { title, description, subject, subcategory, level, type, price } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, { folder: 'studyglade/documents' });
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
      isApproved: user.role === 'admin' ? true : false  // admin uploads auto-approved
    });
    res.status(201).json(doc);
  } catch (err) {
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

module.exports = router;