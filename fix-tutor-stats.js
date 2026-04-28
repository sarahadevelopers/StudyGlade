// fix-tutor-stats.js – Run once to fix historical data for ALL tutors
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Question = require('./models/Question');
const Transaction = require('./models/Transaction');
const Withdrawal = require('./models/Withdrawal');

async function fixAllTutorsStats() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    const tutors = await User.find({ role: 'tutor' });
    console.log(`📌 Found ${tutors.length} tutor(s)\n`);

    for (const tutor of tutors) {
      console.log(`--- Processing: ${tutor.email} (${tutor._id}) ---`);

      // 1. Total earnings from completed questions
      const completedQuestions = await Question.find({ tutorId: tutor._id, status: 'completed' });
      let totalEarnings = 0;
      for (const q of completedQuestions) {
        totalEarnings += q.budget * 0.76;
      }
      tutor.tutorProfile.totalEarnings = totalEarnings;
      console.log(`  ✅ Total earnings: $${totalEarnings.toFixed(2)}`);

      // 2. Average rating
      const ratedQuestions = await Question.find({
        tutorId: tutor._id,
        status: 'completed',
        'rating.score': { $exists: true }
      });
      let sumRating = 0;
      for (const q of ratedQuestions) {
        sumRating += q.rating.score;
      }
      const avgRating = ratedQuestions.length ? sumRating / ratedQuestions.length : 0;
      tutor.tutorProfile.rating = avgRating;
      console.log(`  ✅ Average rating: ${avgRating.toFixed(1)} ⭐`);

      // 3. Withdrawals: create missing transactions (for approved withdrawals)
      const withdrawals = await Withdrawal.find({ userId: tutor._id, status: 'approved' });
      let totalWithdrawn = 0;
      for (const w of withdrawals) {
        totalWithdrawn += w.amount;
        const existingTx = await Transaction.findOne({
          description: { $regex: `Withdrawal request #${w._id}` }
        });
        if (!existingTx) {
          await Transaction.create({
            userId: tutor._id,
            type: 'withdraw',
            amount: -w.amount,
            description: `Withdrawal request #${w._id}: $${w.amount} via ${w.method}`,
            createdAt: w.processedAt || w.createdAt
          });
          console.log(`    ➕ Added missing transaction for withdrawal #${w._id}`);
        }
      }
      console.log(`  ✅ Total approved withdrawals: $${totalWithdrawn.toFixed(2)}`);

      // 4. (Optional) Fix level from "Entry" to "Entry-Level"
      if (tutor.tutorProfile.level === 'Entry') {
        tutor.tutorProfile.level = 'Entry-Level';
        console.log(`  ✅ Level updated: "Entry" → "Entry-Level"`);
      }

      await tutor.save();
      console.log(`  ✅ Tutor ${tutor.email} updated.\n`);
    }

    console.log('🚀 All tutors fixed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

fixAllTutorsStats();