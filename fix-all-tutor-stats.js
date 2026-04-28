// fix-all-tutor-stats.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Question = require('./models/Question');
const Transaction = require('./models/Transaction');
const Withdrawal = require('./models/Withdrawal');
const Document = require('./models/Document');   // <-- new

async function fixAllTutors() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    const tutors = await User.find({ role: 'tutor' });
    console.log(`📌 Found ${tutors.length} tutor(s)\n`);

    for (const tutor of tutors) {
      console.log(`--- Processing: ${tutor.email} (${tutor._id}) ---`);

      // 1. Earnings from completed questions
      const completedQuestions = await Question.find({ tutorId: tutor._id, status: 'completed' });
      let questionEarnings = 0;
      for (const q of completedQuestions) {
        questionEarnings += q.budget * 0.76;
      }

      // 2. Earnings from document sales (65% of each sold document)
      const documentSales = await Document.find({ uploaderId: tutor._id });
      let documentEarnings = 0;
      for (const doc of documentSales) {
        // Each document may have been sold multiple times (downloads count)
        // You need to know how many times it was unlocked.
        // The simplest is to query the Transaction collection for "unlock_document" events.
        const sales = await Transaction.find({
          type: 'unlock_document',
          description: { $regex: `Unlocked: ${doc.title}` }
        });
        documentEarnings += sales.length * (doc.price * 0.65);
      }

      const totalEarnings = questionEarnings + documentEarnings;
      tutor.tutorProfile.totalEarnings = totalEarnings;
      console.log(`  ✅ Total earnings = $${questionEarnings.toFixed(2)} (questions) + $${documentEarnings.toFixed(2)} (documents) = $${totalEarnings.toFixed(2)}`);

      // 3. Recalculate average rating from all rated questions
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
      console.log(`  ✅ Average rating: ${avgRating.toFixed(1)} ⭐ (based on ${ratedQuestions.length} rating(s))`);

      // 4. Fix withdrawals: create missing transactions based on wallet balance discrepancy
      // Calculate total withdrawn = (total earnings + initial balance?) – current balance
      // Simpler: if there are no withdrawal transactions, assume all missing amount is withdrawals.
      const existingWithdrawalsTotal = await Transaction.aggregate([
        { $match: { userId: tutor._id, type: 'withdraw' } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
      ]);
      const recordedWithdrawals = existingWithdrawalsTotal[0]?.total || 0;
      // You also have deposits (from Paystack or simulated add funds)
      const depositsTotal = await Transaction.aggregate([
        { $match: { userId: tutor._id, type: 'deposit' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const totalDeposits = depositsTotal[0]?.total || 0;
      // Theoretical balance = totalDeposits + totalEarnings - recordedWithdrawals
      const theoreticalBalance = totalDeposits + totalEarnings - recordedWithdrawals;
      const actualBalance = tutor.walletBalance;
      const missingWithdrawals = theoreticalBalance - actualBalance;
      if (Math.abs(missingWithdrawals) > 0.01 && missingWithdrawals > 0) {
        // Create a manual withdrawal transaction to balance the books
        await Transaction.create({
          userId: tutor._id,
          type: 'withdraw',
          amount: -missingWithdrawals,
          description: `Manual adjustment: missing withdrawals (balance fix)`,
          createdAt: new Date()
        });
        console.log(`  💸 Added missing withdrawal transaction: $${missingWithdrawals.toFixed(2)}`);
      } else {
        console.log(`  ✅ Withdrawals already recorded: $${recordedWithdrawals.toFixed(2)}`);
      }

      // 5. (Optional) Fix level name
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

fixAllTutors();