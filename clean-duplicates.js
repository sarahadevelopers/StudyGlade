const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;
  const result = await db.collection('transactions').aggregate([
    { $match: { description: /^Paystack deposit - Ref:/ } },
    { $group: { _id: "$description", ids: { $addToSet: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  for (const doc of result) {
    doc.ids.shift(); // keep first, delete rest
    await db.collection('transactions').deleteMany({ _id: { $in: doc.ids } });
    console.log(`Removed ${doc.ids.length} duplicates for ref ${doc._id}`);
  }
  console.log('Duplicate cleanup finished');
  process.exit();
}).catch(err => console.error(err));