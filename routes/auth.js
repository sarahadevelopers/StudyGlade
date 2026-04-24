const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

const router = express.Router();

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

// Helper for cookie settings (cross‑origin friendly)
function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,          // true in production (HTTPS)
    sameSite: isProduction ? 'none' : 'lax',  // 'none' for cross‑origin, 'lax' for local
    maxAge: 15 * 60 * 1000         // access token lifetime (15 min)
  };
}

function getRefreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000  // refresh token lifetime (7 days)
  };
}

// ----------------- Register -----------------
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, role } = req.body;
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already exists' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      password: hashed,
      fullName,
      role,
      isApproved: role === 'student' || role === 'admin' ? true : false
    });
    const { accessToken, refreshToken } = generateTokens(user._id, user.role);
    user.refreshToken = refreshToken;
    await user.save();

    res.cookie('accessToken', accessToken, getCookieOptions());
    res.cookie('refreshToken', refreshToken, getRefreshCookieOptions());
    res.json({ user: { id: user._id, email, fullName, role, walletBalance: user.walletBalance } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ----------------- Login -----------------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    // Check if account is locked
    if (user && user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(401).json({ error: 'Account locked. Try again later.' });
    }
    
    // Invalid credentials handling
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
    
    // Reset failed attempts on success
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    
    // Tutor approval check
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