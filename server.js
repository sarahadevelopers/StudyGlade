require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const cookieParser = require('cookie-parser');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

const app = express();

// ========== 1. ENSURE UPLOADS FOLDER EXISTS ==========
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('📁 Created uploads folder');
}

// ========== 2. MULTER CONFIGURATION (unchanged) ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + safeName);
  }
});

const fileFilter = (req, file, cb) => {
  console.log(`📎 Uploading: ${file.originalname} (MIME: ${file.mimetype})`);
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExt = ['.jpg','.jpeg','.png','.gif','.webp','.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.zip','.txt','.csv','.mp4','.webm'];
  if (allowedExt.includes(ext)) {
    console.log(`✅ Allowed by extension: ${ext}`);
    cb(null, true);
    return;
  }
  const allowedTypes = [
    'image/jpeg','image/png','image/gif','image/webp',
    'application/pdf','application/x-pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip','application/x-zip-compressed','application/octet-stream',
    'text/plain','text/csv','video/mp4','video/webm'
  ];
  if (allowedTypes.includes(file.mimetype)) {
    console.log(`✅ Allowed by MIME type: ${file.mimetype}`);
    cb(null, true);
  } else {
    console.warn(`❌ Rejected: ${file.originalname} (MIME: ${file.mimetype}, ext: ${ext})`);
    cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 200 * 1024 * 1024 } });
module.exports.upload = upload;

// ========== 3. REQUIRE ROUTES & MODELS ==========
const authRoutes = require('./routes/auth');
const questionRoutes = require('./routes/questions');
const documentRoutes = require('./routes/documents');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');
const commentRoutes = require('./routes/comments');
const notificationRoutes = require('./routes/notifications');
const subjectRoutes = require('./routes/subjects');
const publicQuestionRoutes = require('./routes/publicQuestions');   // ✅ NEW

const Bid = require('./models/Bid');
const Question = require('./models/Question');
const Transaction = require('./models/Transaction');
const User = require('./models/User');
const Document = require('./models/Document');

// ========== 4. PAYSTACK WEBHOOK (raw body) – unchanged ==========
app.post('/api/wallet/paystack-webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
  if (hash !== req.headers['x-paystack-signature']) {
    console.error('Invalid Paystack signature');
    return res.status(401).send('Unauthorized');
  }
  const event = JSON.parse(req.body.toString());
  if (event.event === 'charge.success') {
    const { reference, metadata } = event.data;
    const { userId, amount } = metadata;
    const existingTx = await Transaction.findOne({ description: `Paystack deposit - Ref: ${reference}` });
    if (existingTx) {
      console.log(`Duplicate webhook ignored for ref ${reference}`);
      return res.sendStatus(200);
    }
    const user = await User.findById(userId);
    if (!user) {
      console.error(`User ${userId} not found`);
      return res.status(404).send('User not found');
    }
    try {
      const verifyRes = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${secret}` }
      });
      if (verifyRes.data.data.status !== 'success') {
        console.error(`Verification failed for ref ${reference}`);
        return res.status(400).send('Verification failed');
      }
      const verifiedAmount = verifyRes.data.data.amount / 100;
      if (parseFloat(amount) !== verifiedAmount) {
        console.error(`Amount mismatch: expected ${amount}, got ${verifiedAmount}`);
        return res.status(400).send('Amount mismatch');
      }
      user.walletBalance += verifiedAmount;
      await user.save();
      await Transaction.create({
        userId: user._id, type: 'deposit', amount: verifiedAmount,
        description: `Paystack deposit - Ref: ${reference}`
      });
      console.log(`Wallet credited: ${verifiedAmount} to user ${userId}`);
    } catch (err) {
      console.error('Webhook verification error:', err.message);
      return res.status(500).send('Internal error');
    }
  }
  res.sendStatus(200);
});

// ========== 5. CORS – add production domains ==========
const allowedOrigins = [
  'http://localhost:5000',
  'http://localhost:3000',
  'https://studyglade.onrender.com',
  'https://studyglade.com',
  'https://www.studyglade.com'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('CORS policy does not allow this origin.'), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

// ========== 6. STANDARD MIDDLEWARE ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (req.path === '/api/questions' && req.method === 'POST') {
    console.log('Incoming POST /api/questions with content-type:', req.headers['content-type']);
  }
  next();
});

// ========== 6b. REDIRECT FROM OLD RENDER URL TO NEW PRODUCTION DOMAIN ==========
app.use((req, res, next) => {
  const host = req.headers.host;
  if (host && host.endsWith('onrender.com')) {
    return res.redirect(301, `https://studyglade.com${req.originalUrl}`);
  }
  next();
});

// ========== 7. EJS SETUP ==========
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ========== 8. DATABASE CONNECTION ==========
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ========== 9. API ROUTES – MUST COME BEFORE STATIC & CATCH-ALL ==========
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check (alive probe)
app.get('/health', (req, res) => res.send('OK'));

// ========== 10. SEO & PUBLIC ROUTES (document, sitemap, subjects, questions) ==========
app.get('/document/:slug', async (req, res) => {
  try {
    const document = await Document.findOne({ slug: req.params.slug, isApproved: true });
    if (!document) return res.status(404).send('Document not found');
    const token = req.cookies.accessToken;
    let user = null;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        user = await User.findById(decoded.id).select('-password');
      } catch (err) {}
    }
    res.render('document', { document, user });
  } catch (err) {
    console.error('Error in /document/:slug:', err);
    res.status(500).send('Server error');
  }
});

// Subject pages (SEO)
app.use('/subjects', subjectRoutes);

// Public question pages (SEO)
app.use('/question', publicQuestionRoutes);

app.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = 'https://studyglade.com';
    let urls = '';

    // Approved documents
    const documents = await Document.find({ isApproved: true }).select('slug updatedAt');
    documents.forEach(doc => {
      urls += `
        <url>
          <loc>${baseUrl}/document/${doc.slug}</loc>
          <lastmod>${doc.updatedAt.toISOString()}</lastmod>
          <changefreq>monthly</changefreq>
          <priority>0.7</priority>
        </url>
      `;
    });

    // Subject pages (static list)
    const subjects = [
      'math-homework-help', 'statistics-help', 'nursing-assignment-help',
      'python-homework-help', 'calculus-help', 'essay-writing-help',
      'chemistry-tutor', 'physics-help'
    ];
    subjects.forEach(slug => {
      urls += `
        <url>
          <loc>${baseUrl}/subjects/${slug}</loc>
          <changefreq>weekly</changefreq>
          <priority>0.8</priority>
        </url>
      `;
    });

    // Completed questions for SEO
    const completedQuestions = await Question.find({ status: 'completed' }).select('_id updatedAt');
    completedQuestions.forEach(q => {
      urls += `
        <url>
          <loc>${baseUrl}/question/${q._id}</loc>
          <lastmod>${q.updatedAt.toISOString()}</lastmod>
          <changefreq>monthly</changefreq>
          <priority>0.6</priority>
        </url>
      `;
    });

    res.header('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls}
</urlset>`);
  } catch (err) {
    console.error('Sitemap error:', err);
    res.status(500).send('Error generating sitemap');
  }
});

// ========== 11. STATIC FRONTEND (docs folder) ==========
app.use(express.static(path.join(__dirname, 'docs')));

// Explicit routes for login/register (preserve clean URLs)
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'register.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'login.html'));
});

// ========== 12. CATCH-ALL FOR SPA (must be last) ==========
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

// ========== 13. CRON JOBS ==========
cron.schedule('0 * * * *', async () => {
  console.log('Running budget suggestion cron job...');
  try {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const oldQuestions = await Question.find({
      status: 'pending',
      createdAt: { $lt: sixHoursAgo },
      budgetSuggestionSent: { $ne: true }
    });
    for (const question of oldQuestions) {
      const lowestBid = await Bid.findOne({ questionId: question._id }).sort({ amount: 1 });
      if (lowestBid && lowestBid.amount > question.budget) {
        question.suggestedBudget = lowestBid.amount;
        question.suggestedTutorId = lowestBid.tutorId;
        question.budgetSuggestionSent = true;
        await question.save();
        console.log(`✅ Suggestion for question ${question._id}: increase to $${lowestBid.amount}`);
      } else {
        question.budgetSuggestionSent = true;
        await question.save();
      }
    }
  } catch (err) {
    console.error('Cron job error:', err);
  }
});

const updateTutorLevels = require('./utils/updateTutorLevels');
cron.schedule('0 0 * * *', () => {
  console.log('Running tutor level update...');
  updateTutorLevels().catch(console.error);
});

// ========== 14. GLOBAL ERROR HANDLER (returns JSON for API routes) ==========
app.use((err, req, res, next) => {
  console.error('Global error:', err.stack);
  if (req.originalUrl && req.originalUrl.startsWith('/api/')) {
    return res.status(err.statusCode || 500).json({
      error: err.message || 'Internal Server Error'
    });
  }
  res.status(500).send('Something went wrong!');
});

// ========== 15. START SERVER ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));