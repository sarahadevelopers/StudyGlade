// test-withdrawals.js
require('dotenv').config();
const mongoose = require('mongoose');
const Withdrawal = require('./models/Withdrawal');

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const tutorId = "69eb01598a80a89daed20ae7"; // Replace with your actual tutor ID

    const result = await Withdrawal.aggregate([
      {
        $match: {
          $expr: {
            $eq: [{ $toString: "$userId" }, tutorId]
          }
        }
      },
      { $match: { status: "approved" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    console.log('Result:', result);
    if (result.length > 0) {
      console.log(`✅ Total approved withdrawals: $${result[0].total}`);
    } else {
      console.log('No approved withdrawals found for this tutor.');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

test();