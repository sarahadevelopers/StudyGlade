const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const User = require('../models/User');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { handleValidationErrors, sanitizeText, sanitizeEmail, validatePassword } = require('../middleware/validate');
const Notification = require('../models/Notification');
const { sendEmailWithTemplate } = require('../utils/email');

const router = express.Router();

// ---------- Rate limiters (unchanged) ----------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many registration attempts. Please try again after an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password reset attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------- Cloudinary, Multer, Email helpers (unchanged) ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

let resend = null;
try {
  if (process.env.RESEND_API_KEY) {
    const { Resend } = require('resend');
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('✅ Resend initialized');
  } else {
    console.warn('⚠️ RESEND_API_KEY not set – emails will be logged to console');
  }
} catch (err) {
  console.error('❌ Failed to initialize Resend:', err.message);
}

async function sendEmail(to, subject, text) {
  if (!resend) {
    console.log(`📧 [DEV] Email to ${to}: ${subject} - ${text}`);
    return;
  }
  try {
    const { data, error } = await resend.emails.send({
      from: 'StudyGlade <info@studyglade.com>',
      to: [to],
      subject: subject,
      html: `<p>${text}</p>`,
    });
    if (error) throw error;
    console.log('✅ Email sent:', data.id);
  } catch (err) {
    console.error('❌ Resend error:', err.message);
  }
}

// ---------- Token & cookie helpers (unchanged) ----------
function generateTokens(userId, role) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const accessToken = jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: '72h' });
  const refreshToken = jwt.sign({ id: userId, role, iat: issuedAt }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax', maxAge: 15 * 60 * 1000 };
}

function getRefreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 };
}

// ----------------- Register (with validation & sanitization) -----------------
router.post('/register', 
  registerLimiter,
  upload.single('portfolio'),
  sanitizeEmail('email'),
  validatePassword('password'),
  sanitizeText('fullName').isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
  body('role').isIn(['student', 'tutor', 'admin']).withMessage('Invalid role'),
  body('essay').if(body('role').equals('tutor')).isLength({ min: 500 }).withMessage('Essay must be at least 500 characters'),
  body('quizAnswers').if(body('role').equals('tutor')).custom(value => {
    try {
      const parsed = JSON.parse(value);
      if (parsed.q1 !== 'A' || parsed.q2 !== 'B' || parsed.q3 !== 'False') throw new Error();
      return true;
    } catch {
      throw new Error('Quiz answers are incorrect');
    }
  }),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { fullName, email, password, role } = req.body;

      const existing = await User.findOne({ email });
      if (existing) return res.status(400).json({ error: 'Email already exists' });

      const hashed = await bcrypt.hash(password, 10);

      const userData = {
        email,
        password: hashed,
        fullName,
        role,
        isApproved: role === 'student' || role === 'admin' ? true : false
      };

      if (role === 'tutor') {
        const { qualifications, subjects, essay, essayFormat, quizAnswers } = req.body;

        let parsedQuiz = JSON.parse(quizAnswers);
        let portfolioUrl = null;
        if (req.file) {
          const result = await cloudinary.uploader.upload(req.file.path, { folder: 'studyglade/tutor_applications' });
          portfolioUrl = result.secure_url;
          await fs.unlink(req.file.path);
        }

        userData.tutorApplication = {
          qualifications,
          subjects: subjects ? subjects.split(',').map(s => s.trim()) : [],
          essay,
          essayFormat: essayFormat || 'APA',
          portfolioUrl,
          quizAnswers: parsedQuiz,
          status: 'pending',
          appliedAt: new Date()
        };

        const { preferredMethod, paypalEmail, mpesaPhone, bankName, accountName, accountNumber } = req.body;
        userData.paymentDetails = {
          preferredMethod: preferredMethod || 'paypal',
          paypalEmail: paypalEmail || '',
          mpesaPhone: mpesaPhone || '',
          bankAccount: {
            bankName: bankName || '',
            accountName: accountName || '',
            accountNumber: accountNumber || ''
          }
        };
      }

      const user = await User.create(userData);
      const { accessToken, refreshToken } = generateTokens(user._id, user.role);
      user.refreshToken = refreshToken;
      await user.save();

      // ✅ Send pending application email to tutor (if role is tutor)
      if (role === 'tutor') {
        try {
          await sendEmailWithTemplate(user.email, 'Tutor Application Received – StudyGlade', 'tutor-application-pending.ejs', {
            tutorName: user.fullName
          });
          console.log(`📧 Pending application email sent to ${user.email}`);
        } catch (emailErr) {
          console.error('Failed to send pending tutor email:', emailErr);
          // Do not block registration if email fails
        }
      }

      // ✅ Welcome notification ONLY for instant‑approval roles (student, admin)
      if (role !== 'tutor') {
        try {
          await Notification.create({
            userId: user._id,
            type: 'question_posted',
            title: '🎉 Welcome to StudyGlade!',
            message: `Hi ${fullName}, we're excited to have you! Start by posting a question, exploring the document library, or finding a tutor.`,
            link: role === 'student' ? '/student-dashboard.html' : '/admin-dashboard.html',
            read: false
          });
          console.log(`✅ Welcome notification created for ${email} (${role})`);
        } catch (notifErr) {
          console.error('Failed to create welcome notification:', notifErr);
        }
      } else {
        console.log(`📝 Tutor ${email} registered – waiting for admin approval.`);
      }

      res.cookie('accessToken', accessToken, getCookieOptions());
      res.cookie('refreshToken', refreshToken, getRefreshCookieOptions());

      const responseUser = {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        walletBalance: user.walletBalance
      };
      if (role === 'tutor') {
        responseUser.applicationStatus = user.tutorApplication?.status || 'pending';
      }
      res.json({ user: responseUser });
    } catch (err) {
      console.error('Register error:', err);
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      res.status(400).json({ error: err.message });
    }
  }
);

// ----------------- Login (with validation) -----------------
router.post('/login',
  loginLimiter,
  sanitizeEmail('email'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      
      if (user && user.lockUntil && user.lockUntil > Date.now()) {
        return res.status(401).json({ error: 'Account locked. Try again later.' });
      }
      
      if (!user || !(await bcrypt.compare(password, user.password))) {
        if (user) {
          user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
          if (user.failedLoginAttempts >= 3) {
            user.lockUntil = Date.now() + 15 * 60 * 1000;
            user.failedLoginAttempts = 0;
          }
          await user.save();
        }
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      
      if (user.role === 'tutor' && !user.isApproved) {
        return res.status(403).json({ error: 'Tutor account pending approval' });
      }
      
      const { accessToken, refreshToken } = generateTokens(user._id, user.role);
      user.refreshToken = refreshToken;
      await user.save();

      res.cookie('accessToken', accessToken, getCookieOptions());
      res.cookie('refreshToken', refreshToken, getRefreshCookieOptions());
      
      res.json({ 
  user: { 
    id: user._id, 
    email, 
    fullName: user.fullName, 
    role: user.role, 
    walletBalance: user.walletBalance,
    avatar: user.avatar || '',
    gender: user.gender || 'other'
  },
  accessToken  // 👈 add this line
});
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ----------------- Refresh Token (unchanged) -----------------
router.post('/refresh-token', async (req, res) => {
  // ... keep existing implementation ...
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });
  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }
    const tokenAge = (Date.now() / 1000) - decoded.iat;
    if (tokenAge > 72 * 3600) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id, user.role);
    user.refreshToken = newRefreshToken;
    await user.save();
    res.cookie('accessToken', accessToken, getCookieOptions());
    res.cookie('refreshToken', newRefreshToken, getRefreshCookieOptions());
    res.json({ message: 'Tokens refreshed' });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(403).json({ error: 'Invalid or expired refresh token' });
  }
});

// ----------------- Forgot Password (with email sanitization) -----------------
router.post('/forgot-password', 
  forgotPasswordLimiter,
  sanitizeEmail('email'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ error: 'No account with that email' });
      const token = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = token;
      user.resetPasswordExpires = Date.now() + 3600000;
      await user.save();
      const resetLink = `https://studyglade.com/reset-password.html?token=${token}`;
      await sendEmail(user.email, 'Password Reset', `Click here to reset your password: ${resetLink}`);
      res.json({ message: 'Reset link sent to your email' });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ----------------- Reset Password (with validation) -----------------
router.post('/reset-password',
  resetPasswordLimiter,
  body('token').notEmpty().withMessage('Token required'),
  validatePassword('newPassword'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() }
      });
      if (!user) return res.status(400).json({ error: 'Invalid or expired token' });
      user.password = await bcrypt.hash(newPassword, 10);
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      user.refreshToken = null;
      await user.save();
      res.json({ message: 'Password updated. Please log in.' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ----------------- Get Current User (unchanged) -----------------
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-password -refreshToken -resetPasswordToken -resetPasswordExpires -failedLoginAttempts -lockUntil');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('Get /me error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------- Avatar Upload (unchanged) -----------------
const multerMemory = multer({ storage: multer.memoryStorage() });
router.post('/avatar', auth, multerMemory.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'studyglade/avatars', transformation: [{ width: 150, height: 150, crop: 'fill' }] },
        (error, uploadResult) => {
          if (error) reject(error);
          else resolve(uploadResult);
        }
      ).end(req.file.buffer);
    });
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.avatar = result.secure_url;
    await user.save();
    res.json({ avatarUrl: result.secure_url });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ----------------- Logout (unchanged) -----------------
router.post('/logout', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    const user = await User.findOne({ refreshToken });
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
  }
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.clearCookie('X-CSRF-Token');
  res.json({ message: 'Logged out' });
});

module.exports = router;