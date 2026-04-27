require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const cookieParser = require('cookie-parser');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();

// ---------- 1. ENSURE UPLOADS FOLDER EXISTS ----------
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log('📁 Created uploads folder');
}

// ---------- 2. MULTER CONFIGURATION (exported for routes) ----------
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
    'text/plain'
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, PNG, GIF, TXT'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ✅ EXPORT IMMEDIATELY – before any route requires
module.exports.upload = upload;

// ---------- 3. NOW REQUIRE ROUTES (they can import the upload) ----------
const authRoutes = require('./routes/auth');
const questionRoutes = require('./routes/questions');
const documentRoutes = require('./routes/documents');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');
const commentRoutes = require('./routes/comments');

// Models for cron jobs (these do NOT depend on upload)
const Bid = require('./models/Bid');
const Question = require('./models/Question');

// ---------- 4. CORS CONFIGURATION ----------
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

// ---------- 5. STANDARD MIDDLEWARE ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---------- 6. DATABASE CONNECTION ----------
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ---------- 7. API ROUTES ----------
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/comments', commentRoutes);

// Health check
app.get('/health', (req, res) => res.send('OK'));

// ---------- 8. STATIC FRONTEND (docs folder) ----------
app.use(express.static(path.join(__dirname, 'docs')));

// Catch-all for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

// ---------- 9. CRON JOBS ----------
// Budget suggestion (every hour)
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

// Tutor level progression (every midnight)
const updateTutorLevels = require('./utils/updateTutorLevels');
cron.schedule('0 0 * * *', () => {
  console.log('Running tutor level update...');
  updateTutorLevels().catch(console.error);
});

// ---------- 10. GLOBAL ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error('Global error:', err.stack);
  res.status(500).json({ error: err.message });
});

// ---------- 11. START SERVER ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));