const mongoose = require('mongoose');
require('dotenv').config();

async function recalcWallet() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const studentId = new mongoose.Types.ObjectId("69eaffa78a80a89daed20ad8");

  // Aggregate unique deposits (by description)
  const depositsAgg = await db.collection('transactions').aggregate([
    { $match: { userId: studentId, type: "deposit" } },
    { $group: { _id: "$description", amount: { $first: "$amount" } } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]).toArray();
  const deposits = depositsAgg[0]?.total || 0;

  // Aggregate spending (negative amounts)
  const spendsAgg = await db.collection('transactions').aggregate([
    { $match: { userId: studentId, type: { $in: ["post_question", "unlock_document", "post_question_extra"] } } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]).toArray();
  const spends = spendsAgg[0]?.total || 0;

  const trueBalance = deposits + spends; // spends are negative

  // Update the user's wallet
  await db.collection('users').updateOne(
    { _id: studentId },
    { $set: { walletBalance: trueBalance } }
  );

  console.log(`Recalculated wallet: $${trueBalance}`);
  process.exit();
}

recalcWallet().catch(console.error);