require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('../models/Question');

async function updateDemoQuestionDates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const now = new Date();
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + 3); // due in 3 days

    const result = await Question.updateMany(
      { isDemo: true },
      {
        $set: {
          createdAt: now,
          deadline: deadline,
          updatedAt: now
        }
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} demo questions with new dates.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating demo dates:', err);
    process.exit(1);
  }
}

updateDemoQuestionDates();