// update-demo-questions.js
// Run with: node update-demo-questions.js

require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

// Connection URI from your .env
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

async function updateDummyQuestions() {
  try {
    // 1. Find questions that are likely dummy (no school/course, or title contains common demo patterns)
    // Adjust filter as needed – you can add more conditions.
    const filter = {
      $or: [
        { isDemo: { $ne: true } },          // not marked as demo
        { school: { $exists: false } },      // missing school
        { course: { $exists: false } },      // missing course
        { school: '' },                      // empty school
        { course: '' }                       // empty course
      ]
    };

    // Optional: only target questions that seem like demos (e.g., created by admin)
    // Add a condition like: { studentId: { $exists: true } } to avoid real users

    const questions = await Question.find(filter);
    console.log(`📋 Found ${questions.length} questions that need updating.`);

    if (questions.length === 0) {
      console.log('✅ No questions need updating.');
      process.exit(0);
    }

    console.log('🔄 Updating questions...');
    let updatedCount = 0;

    for (const q of questions) {
      let updateFields = {
        isDemo: true,
        school: q.school || 'GCU',
        course: q.course || 'Not specified',
        subject: (q.subject && q.subject.trim() !== '') ? q.subject : 'General'
      };

      // If the question already has a deadline, keep it; otherwise set to 3 days from now
      if (!q.deadline) {
        updateFields.deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      }

      await Question.updateOne({ _id: q._id }, { $set: updateFields });
      updatedCount++;
      if (updatedCount % 10 === 0) console.log(`✅ Updated ${updatedCount} questions...`);
    }

    console.log(`✅ Successfully updated ${updatedCount} questions.`);
  } catch (err) {
    console.error('❌ Error during update:', err);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Ask for confirmation before running
console.log('⚠️  This script will update all questions missing school/course or isDemo flag.');
console.log('⚠️  It will set isDemo: true, school: "GCU", course: "Not specified", subject: "General" (if missing).');
console.log('⚠️  If deadline is missing, it will be set to 3 days from now.');
console.log('ℹ️  To customize the filter, edit the filter object in the script.');

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('Do you want to continue? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    readline.close();
    updateDummyQuestions();
  } else {
    console.log('❌ Operation cancelled.');
    readline.close();
    process.exit(0);
  }
});