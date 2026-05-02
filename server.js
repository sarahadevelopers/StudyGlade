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

// ---------- 1. ENSURE UPLOADS FOLDER EXISTS ----------
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log('📁 Created uploads folder');
}

// ---------- 2. MULTER CONFIGURATION ----------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'video/mp4', 'video/webm',
    'image/webp'
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

module.exports.upload = upload;

// ---------- 3. REQUIRE ROUTES & MODELS ----------
const authRoutes = require('./routes/auth');
const questionRoutes = require('./routes/questions');
const documentRoutes = require('./routes/documents');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');
const commentRoutes = require('./routes/comments');

const Bid = require('./models/Bid');
const Question = require('./models/Question');
const Transaction = require('./models/Transaction');
const User = require('./models/User');
const Document = require('./models/Document'); // Needed for /document/:slug

// ---------- 4. PAYSTACK WEBHOOK (raw body) ----------
app.post('/api/wallet/paystack-webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');
  if (hash !== req.headers['x-paystack-signature']) {
    console.error('Invalid Paystack signature');
    return res.status(401).send('Unauthorized');
  }
  const event = req.body;
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
        userId: user._id,
        type: 'deposit',
        amount: verifiedAmount,
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

// ---------- 5. CORS ----------
const allowedOrigins = [
  'http://localhost:5000',
  'http://localhost:3000',
  'https://studyglade.onrender.com'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'CORS policy does not allow this origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

// ---------- 6. STANDARD MIDDLEWARE ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---------- 7. EJS SETUP ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------- 8. DATABASE CONNECTION ----------
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ---------- 9. PUBLIC SEO ROUTE FOR DOCUMENTS ----------
app.get('/document/:slug', async (req, res) => {
  try {
    const document = await Document.findOne({ slug: req.params.slug, isApproved: true });
    if (!document) {
      return res.status(404).send('Document not found');
    }

    // Debugging: log cookies and token presence
    console.log(`[DEBUG] Request for document: ${req.params.slug}`);
    console.log(`[DEBUG] Cookies received:`, req.cookies);
    const token = req.cookies.token;
    console.log(`[DEBUG] Token present: ${token ? 'yes' : 'no'}`);

    let user = null;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log(`[DEBUG] Decoded token userId: ${decoded.userId}`);
        user = await User.findById(decoded.userId).select('-password');
        if (user) {
          console.log(`[DEBUG] User found: ${user.email} (role: ${user.role})`);
        } else {
          console.log(`[DEBUG] No user found with that ID`);
        }
      } catch (err) {
        console.error(`[DEBUG] Token verification error:`, err.message);
      }
    } else {
      console.log(`[DEBUG] No token cookie - user is guest`);
    }

    res.render('document', { document, user });
  } catch (err) {
    console.error('Error in /document/:slug:', err);
    res.status(500).send('Server error');
  }
});

// ---------- 10. SITEMAP.XML ----------
app.get('/sitemap.xml', async (req, res) => {
  try {
    const documents = await Document.find({ isApproved: true }).select('slug updatedAt');
    let urls = documents.map(doc => `
      <url>
        <loc>https://studyglade.onrender.com/document/${doc.slug}</loc>
        <lastmod>${doc.updatedAt.toISOString()}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.7</priority>
      </url>
    `).join('');
    
    res.header('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls}
</urlset>`);
  } catch (err) {
    res.status(500).send('Error generating sitemap');
  }
});

// ---------- 11. API ROUTES ----------
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/comments', commentRoutes);

// Health check
app.get('/health', (req, res) => res.send('OK'));

// ---------- 12. STATIC FRONTEND (docs folder) ----------
app.use(express.static(path.join(__dirname, 'docs')));

// Explicit routes for login/register (to preserve clean URLs with query strings)
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'register.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'login.html'));
});

// Catch-all for client-side routing (must be after static and /document)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

// ---------- 13. CRON JOBS ----------
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

// ---------- 14. GLOBAL ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error('Global error:', err.stack);
  res.status(500).json({ error: err.message });
});

// ---------- 15. START SERVER ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));