const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();

// ---------- Get wallet balance & transactions (paginated) ----------
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const user = await User.findById(req.userId);
    const transactions = await Transaction.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await Transaction.countDocuments({ userId: req.userId });
    res.json({
      balance: user.walletBalance,
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- SIMULATED ADD FUNDS (for testing) ----------
router.post('/add-funds', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (amount <= 0) return res.status(400).json({ error: 'Amount must be positive' });
    const user = await User.findById(req.userId);
    user.walletBalance += amount;
    await user.save();
    await Transaction.create({ userId: req.userId, type: 'deposit', amount, description: `Simulated deposit: $${amount}` });
    res.json({ balance: user.walletBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- PAYSTACK: Initialize Transaction ----------
router.post('/paystack/initialize', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const user = await User.findById(req.userId);
    const amountInKobo = Math.round(amount * 100);
    const response = await axios.post('https://api.paystack.co/transaction/initialize', {
      email: user.email,
      amount: amountInKobo,
      currency: 'USD',
      callback_url: `${process.env.FRONTEND_URL}/student-dashboard.html`,
      metadata: {
        userId: req.userId,
        amount: amount.toString()
      }
    }, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    const { authorization_url, reference } = response.data.data;
    res.json({ url: authorization_url, reference });
  } catch (err) {
    console.error('Paystack init error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to initialize payment' });
  }
});

// ---------- PAYSTACK WEBHOOK (charge.success) with duplicate prevention ----------
router.post('/paystack-webhook', express.raw({type: 'application/json'}), async (req, res) => {
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
      console.error(`User ${userId} not found for webhook`);
      return res.status(404).send('User not found');
    }

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
  }
  res.sendStatus(200);
});

// ---------- WITHDRAWAL REQUEST (deduct immediately, create pending request for admin) ----------
router.post('/withdraw', auth, async (req, res) => {
  try {
    const { amount, method, accountDetails } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (!method || !accountDetails) return res.status(400).json({ error: 'Missing method or account details' });

    const user = await User.findById(req.userId);
    if (user.walletBalance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    user.walletBalance -= amount;
    await user.save();

    const withdrawal = new Withdrawal({
      userId: user._id,
      amount,
      method,
      accountDetails,
      status: 'pending'
    });
    await withdrawal.save();

    await Transaction.create({
      userId: req.userId,
      type: 'withdraw',
      amount: -amount,
      description: `Withdrawal request #${withdrawal._id}: $${amount} via ${method}`
    });

    console.log(`Withdrawal request #${withdrawal._id} for $${amount} by ${user.email}`);

    res.json({ message: 'Withdrawal request submitted. Admin will process within 3‑5 business days.', withdrawalId: withdrawal._id, balance: user.walletBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Get total withdrawals amount (for dashboard stats) – FIXED: use $toString to handle both ObjectId and string ----------
// ---------- Get total withdrawals amount – sum only APPROVED withdrawals ----------
router.get('/withdrawals-total', auth, async (req, res) => {
  try {
    const result = await Withdrawal.aggregate([
      { $match: { userId: req.userId, status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const total = result[0]?.total || 0;
    res.json({ total });
  } catch (err) {
    console.error('Withdrawals total error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;