require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const cookieParser = require('cookie-parser');
const path = require('path');   // added for static file serving

const authRoutes = require('./routes/auth');
const questionRoutes = require('./routes/questions');
const documentRoutes = require('./routes/documents');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');
const commentRoutes = require('./routes/comments');
const Bid = require('./models/Bid');
const Question = require('./models/Question');

const app = express();

// ---------- CORS configuration (allow credentials) ----------
// Since frontend and backend are now on the same origin, we can relax CORS.
// Allow localhost for development, and the Render domain for production.
const allowedOrigins = [
  'http://localhost:5000',
  'http://localhost:3000',
  'https://studyglade.onrender.com'   // the domain where both frontend & backend live
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Other middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// API routes (must come before static serving)
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/comments', commentRoutes);

// Health check endpoint
app.get('/health', (req, res) => res.send('OK'));

// ---------- Serve static frontend files from 'docs' ----------
app.use(express.static(path.join(__dirname, 'docs')));

// For any other route not matched by API or static files, serve index.html
// (this allows client‑side routing, e.g., /student-dashboard)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

// ---------- CRON JOB: Check for pending questions >6h and create budget suggestions ----------
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
// -----------------------------------------------------------------

const PORT = process.env.PORT || 5000;
app.use((err, req, res, next) => {
  console.error('Global error:', err.stack);
  res.status(500).json({ error: err.message });
});
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));