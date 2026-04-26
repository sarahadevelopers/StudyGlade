const mongoose = require('mongoose');
require('dotenv').config();

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // Replace with actual student ID (as a string, no ObjectId wrapper needed)
  const studentId = "67e8f1a2b3c4d5e6f7a8b9c0"; // CHANGE THIS TO YOUR STUDENT'S ACTUAL ID

  // Insert missing transactions
  await db.collection('transactions').insertMany([
    { userId: studentId, type: "post_question_extra", amount: -5, description: "Extra budget for accepted bid on question: kasongo", createdAt: new Date() },
    { userId: studentId, type: "post_question_extra", amount: -1, description: "Extra budget for accepted bid on question: murkomeno", createdAt: new Date() }
  ]);

  // Deduct $6 from wallet
  const result = await db.collection('users').updateOne(
    { _id: studentId },
    { $inc: { walletBalance: -6 } }
  );

  console.log(`Updated wallet for student. Modified count: ${result.modifiedCount}`);
  process.exit();
}

fix().catch(err => { console.error(err); process.exit(1); });