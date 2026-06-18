// update-demo-questions.js
// Run with: node update-demo-questions.js

require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

// Connection URI from .env
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ Connection error:', err);
    process.exit(1);
  });

async function runUpdates() {
  try {
    // ---------- 1. Update all dummy questions ----------
    console.log('🔍 Searching for questions that need updating...');

    const filter = {
      isDemo: { $ne: true },
      title: {
        $regex: /Reflection|scholarly articles|Game at the School Fair/i
      }
    };

    const questions = await Question.find(filter);
    console.log(`📋 Found ${questions.length} questions matching the pattern.`);

    if (questions.length > 0) {
      const updateResult = await Question.updateMany(filter, {
        $set: {
          isDemo: true,
          school: 'GCU',
          course: 'Not specified',
          subject: 'General',
          deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from now
        }
      });
      console.log(`✅ Updated ${updateResult.modifiedCount} questions.`);
    } else {
      console.log('ℹ️ No matching questions found – skipping update.');
    }

    // ---------- 2. (Optional) Add restrictedTutors to a specific question ----------
    // UNCOMMENT AND EDIT THE LINES BELOW TO ADD RESTRICTED TUTORS
    /*
    const questionId = '66f5a7b8c9d0e1f2a3b4c5d6'; // Replace with actual question ID
    const tutorId1 = '66f5a7b8c9d0e1f2a3b4c5d7'; // Replace with tutor ID
    const tutorId2 = '66f5a7b8c9d0e1f2a3b4c5d8'; // Optional second tutor

    const result = await Question.updateOne(
      { _id: new mongoose.Types.ObjectId(questionId) },
      { $set: { restrictedTutors: [new mongoose.Types.ObjectId(tutorId1)] } }
    );

    if (result.modifiedCount > 0) {
      console.log(`✅ Added restrictedTutors to question ${questionId}.`);
    } else {
      console.log(`⚠️ No document updated – check the question ID.`);
    }
    */

  } catch (err) {
    console.error('❌ Error during update:', err);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Ask for confirmation before running
console.log('⚠️  This script will update questions matching the pattern:');
console.log('   - isDemo is not true');
console.log('   - title contains "Reflection", "scholarly articles", or "Game at the School Fair"');
console.log('   - It will set isDemo: true, school: "GCU", course: "Not specified", subject: "General", deadline: 3 days from now.');
console.log('');
console.log('ℹ️  To add restrictedTutors to a specific question, uncomment the block at the bottom and fill in the IDs.');
console.log('');

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('Do you want to continue? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    readline.close();
    runUpdates();
  } else {
    console.log('❌ Operation cancelled.');
    readline.close();
    process.exit(0);
  }
});