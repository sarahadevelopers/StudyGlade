const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// ---------- Cloudinary configuration ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ---------- Multer configuration for portfolio file upload (temporary disk storage) ----------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// ---------- Email helper (Resend) ----------
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
      from: 'StudyGlade <onboarding@resend.dev>',
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

// ---------- Token generation ----------
function generateTokens(userId, role) {
  const accessToken = jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
    { id: userId, role },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
}

// Helper for cookie settings
function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000
  };
}

function getRefreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

// ----------------- Register (supports tutor application + payment details) -----------------
router.post('/register', upload.single('portfolio'), async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
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

      if (!essay || essay.length < 500) {
        return res.status(400).json({ error: 'Essay must be at least 500 words.' });
      }

      let parsedQuiz = null;
      try {
        parsedQuiz = JSON.parse(quizAnswers);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid quiz answers format.' });
      }

      if (parsedQuiz.q1 !== 'A' || parsedQuiz.q2 !== 'B' || parsedQuiz.q3 !== 'False') {
        return res.status(400).json({ error: 'You failed the platform rules quiz. Please review the rules and try again.' });
      }

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

      // ✅ NEW: Save payment details for tutor
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
});

// ----------------- Login (unchanged) -----------------
router.post('/login', async (req, res) => {
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
    
    res.json({ user: { id: user._id, email, fullName: user.fullName, role: user.role, walletBalance: user.walletBalance } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------- Refresh Token -----------------
router.post('/refresh-token', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });
  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id, user.role);
    user.refreshToken = newRefreshToken;
    await user.save();
    res.cookie('accessToken', accessToken, getCookieOptions());
    res.cookie('refreshToken', newRefreshToken, getRefreshCookieOptions());
    res.json({ message: 'Tokens refreshed' });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});

// ----------------- Forgot Password -----------------
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'No account with that email' });
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();
    const resetLink = `https://sarahadevelopers.github.io/StudyGlade/reset-password.html?token=${token}`;
    await sendEmail(user.email, 'Password Reset', `Click here to reset your password: ${resetLink}`);
    res.json({ message: 'Reset link sent to your email' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------- Reset Password -----------------
router.post('/reset-password', async (req, res) => {
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
});

// ----------------- Get Current User -----------------
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

// ----------------- Logout -----------------
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
  res.json({ message: 'Logged out' });
});

module.exports = router;