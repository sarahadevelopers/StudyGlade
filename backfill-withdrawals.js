// backfill-withdrawals.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const Withdrawal = require('./models/Withdrawal');

async function backfill() {
  await mongoose.connect(process.env.MONGODB_URI);
  const tutors = await User.find({ role: 'tutor' });

  for (const tutor of tutors) {
    // Find all withdraw transactions for this tutor
    const legacyTx = await Transaction.find({
      userId: tutor._id,
      type: 'withdraw'
    }).sort({ createdAt: 1 });

    for (const tx of legacyTx) {
      // Check if a Withdrawal already exists for this transaction (by amount and close date)
      const existing = await Withdrawal.findOne({
        userId: tutor._id,
        amount: Math.abs(tx.amount),
        createdAt: { $gte: new Date(tx.createdAt.getTime() - 60000), $lte: new Date(tx.createdAt.getTime() + 60000) }
      });
      if (!existing) {
        // Create a Withdrawal record
        await Withdrawal.create({
          userId: tutor._id,
          amount: Math.abs(tx.amount),
          method: tx.description.includes('paypal') ? 'paypal' : 'mpesa',
          accountDetails: { details: 'Legacy withdrawal' },
          status: 'approved', // assume all legacy withdrawals were approved
          createdAt: tx.createdAt,
          processedAt: tx.createdAt,
          processedBy: null
        });
        console.log(`✅ Created Withdrawal for ${tutor.email}: $${Math.abs(tx.amount)}`);
      }
    }
  }
  console.log('Backfill complete');
  process.exit(0);
}
backfill().catch(console.error);