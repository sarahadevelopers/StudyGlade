// fix-all-tutors-ratings-withdrawals.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Question = require('./models/Question');
const Transaction = require('./models/Transaction');

async function fixAllTutors() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    const tutors = await User.find({ role: 'tutor' });
    if (tutors.length === 0) {
      console.log('❌ No tutors found in database.');
      process.exit(1);
    }

    console.log(`📌 Found ${tutors.length} tutor(s):`);
    for (const t of tutors) {
      console.log(`   - ${t.email} (ID: ${t._id})`);
    }
    console.log('');

    for (const tutor of tutors) {
      console.log(`\n--- Processing: ${tutor.email} ---`);

      // 1. Recalculate average rating from rated completed questions
      const ratedQuestions = await Question.find({
        tutorId: tutor._id,
        status: 'completed',
        'rating.score': { $exists: true }
      });
      let sum = 0;
      for (const q of ratedQuestions) sum += q.rating.score;
      const avg = ratedQuestions.length ? sum / ratedQuestions.length : 0;
      tutor.tutorProfile.rating = avg;
      console.log(`   ✅ Rating set to: ${avg.toFixed(1)} ⭐ (based on ${ratedQuestions.length} ratings)`);

      // 2. Calculate missing withdrawals (balance correction)
      const totalEarnings = tutor.tutorProfile.totalEarnings || 0;
      const deposits = await Transaction.aggregate([
        { $match: { userId: tutor._id, type: 'deposit' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const totalDeposits = deposits[0]?.total || 0;

      const recordedWithdrawals = await Transaction.aggregate([
        { $match: { userId: tutor._id, type: 'withdraw' } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
      ]);
      const totalRecordedWithdrawals = recordedWithdrawals[0]?.total || 0;

      const expectedBalance = totalDeposits + totalEarnings - totalRecordedWithdrawals;
      const actualBalance = tutor.walletBalance;
      const missingWithdrawals = expectedBalance - actualBalance;

      if (Math.abs(missingWithdrawals) > 0.01 && missingWithdrawals > 0) {
        await Transaction.create({
          userId: tutor._id,
          type: 'withdraw',
          amount: -missingWithdrawals,
          description: `Manual adjustment: missing withdrawals (balance fix)`,
          createdAt: new Date()
        });
        console.log(`   💸 Added missing withdrawal transaction: $${missingWithdrawals.toFixed(2)}`);
      } else {
        console.log(`   ✅ Withdrawals already correct (recorded: $${totalRecordedWithdrawals.toFixed(2)})`);
      }

      await tutor.save();
    }

    console.log('\n🚀 All tutors fixed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

fixAllTutors();