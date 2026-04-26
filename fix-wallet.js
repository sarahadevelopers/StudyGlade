const mongoose = require('mongoose');
require('dotenv').config();

async function fixWallet() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Student ID from your database
    const studentId = "69eaffa78a80a89daed20ad8";
    const studentObjectId = new mongoose.Types.ObjectId(studentId);

    // Insert missing extra transactions
    const result = await mongoose.connection.db.collection('transactions').insertMany([
      { userId: studentObjectId, type: "post_question_extra", amount: -5, description: "Extra budget for accepted bid on question: kasongo", createdAt: new Date() },
      { userId: studentObjectId, type: "post_question_extra", amount: -1, description: "Extra budget for accepted bid on question: murkomeno", createdAt: new Date() }
    ]);
    console.log(`Inserted ${result.insertedCount} transactions`);

    // Deduct $6 from wallet balance
    const updateResult = await mongoose.connection.db.collection('users').updateOne(
      { _id: studentObjectId },
      { $inc: { walletBalance: -6 } }
    );
    console.log(`Wallet update matched: ${updateResult.matchedCount}, modified: ${updateResult.modifiedCount}`);

    // Verify new balance
    const user = await mongoose.connection.db.collection('users').findOne({ _id: studentObjectId }, { projection: { walletBalance: 1 } });
    console.log(`New wallet balance: $${user?.walletBalance}`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

fixWallet();