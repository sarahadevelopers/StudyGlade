const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Import User model

module.exports = async (req, res, next) => {
  const token = req.cookies.accessToken;
  if (!token) return res.status(401).json({ error: 'Access denied. Please login.' });

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    req.userRole = decoded.role;

    // Fetch user to check suspension status
    const user = await User.findById(req.userId).select('isSuspended suspensionReason suspensionExpiry');
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Check if suspended
    if (user.isSuspended) {
      // Check if suspension expiry has passed (auto‑unsuspend)
      if (user.suspensionExpiry && new Date() > user.suspensionExpiry) {
        // Auto-unsuspend (optional, you can also keep suspended and admin must unsuspend manually)
        user.isSuspended = false;
        user.suspensionReason = '';
        user.suspensionExpiry = null;
        await user.save();
      } else {
        const expiryMsg = user.suspensionExpiry ? ` until ${new Date(user.suspensionExpiry).toLocaleDateString()}` : '';
        return res.status(403).json({ error: `Your account has been suspended${expiryMsg}. Reason: ${user.suspensionReason || 'Violation of platform rules'}` });
      }
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};