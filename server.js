require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const questionRoutes = require('./routes/questions');
const documentRoutes = require('./routes/documents');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'docs' folder (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, 'docs')));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);

// Serve HTML pages (explicit routes – static middleware will also serve them, but this ensures correct paths)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'register.html')));
app.get('/student-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'student-dashboard.html')));
app.get('/tutor-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'tutor-dashboard.html')));
app.get('/admin-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'admin-dashboard.html')));
app.get('/post-question', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'post-question.html')));
app.get('/library', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'document-library.html')));
app.get('/upload-document', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'upload-document.html')));

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'docs', '404.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));