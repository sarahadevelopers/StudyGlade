const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const router = express.Router();

// Get wallet balance & transactions
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const transactions = await Transaction.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50);
    res.json({ balance: user.walletBalance, transactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add funds (simulated payment gateway)
router.post('/add-funds', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (amount <= 0) return res.status(400).json({ error: 'Amount must be positive' });
    const user = await User.findById(req.userId);
    user.walletBalance += amount;
    await user.save();
    await Transaction.create({ userId: req.userId, type: 'deposit', amount, description: `Added $${amount} to wallet` });
    res.json({ balance: user.walletBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Withdraw request (simulated, admin will process)
router.post('/withdraw', auth, async (req, res) => {
  try {
    const { amount, method } = req.body; // method: paypal, mpesa, etc.
    const user = await User.findById(req.userId);
    if (user.walletBalance < amount) return res.status(400).json({ error: 'Insufficient balance' });
    // For MVP, just deduct and record (admin will manually pay)
    user.walletBalance -= amount;
    await user.save();
    await Transaction.create({ userId: req.userId, type: 'withdraw', amount: -amount, description: `Withdrawal request: $${amount} via ${method}` });
    res.json({ message: 'Withdrawal request submitted. Funds will be sent within 3-5 business days.', balance: user.walletBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;