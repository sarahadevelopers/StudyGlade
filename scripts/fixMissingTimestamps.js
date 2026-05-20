// scripts/fixMissingTimestamps.js
require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('../models/Question');

async function fixTimestamps() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const now = new Date();

    const updatedResult = await Question.updateMany(
      { updatedAt: { $exists: false } },
      { $set: { updatedAt: now } }
    );
    console.log(`✅ Updated ${updatedResult.modifiedCount} documents missing updatedAt`);

    const createdResult = await Question.updateMany(
      { createdAt: { $exists: false } },
      { $set: { createdAt: now } }
    );
    console.log(`✅ Updated ${createdResult.modifiedCount} documents missing createdAt`);

    process.exit(0);
  } catch (err) {
    console.error('Error fixing timestamps:', err);
    process.exit(1);
  }
}

fixTimestamps();