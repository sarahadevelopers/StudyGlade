// check-withdrawal.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Transaction = require('./models/Transaction');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const tutor = await User.findOne({ email: 'codewithkaranja@gmail.com' });
  const withdrawals = await Transaction.find({ userId: tutor._id, type: 'withdraw' });
  console.log(`Found ${withdrawals.length} withdrawal transactions:`);
  withdrawals.forEach(w => console.log(`- $${Math.abs(w.amount)}: ${w.description}`));
  process.exit(0);
}
check();