// fix-subject-undefined.js
// Run with: node fix-subject-undefined.js

require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

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

async function fixSubject() {
  try {
    // 1. Find questions where subject is "undefined" (literal string) or empty string
    const filter = {
      $or: [
        { subject: "undefined" },
        { subject: "" }
      ]
    };

    const questions = await Question.find(filter);
    console.log(`📋 Found ${questions.length} questions with subject = "undefined" or empty.`);

    if (questions.length === 0) {
      console.log('✅ No issues found.');
      process.exit(0);
    }

    // 2. Update them: set subject to null (so frontend fallback '—' works)
    const updateResult = await Question.updateMany(filter, { $set: { subject: null } });
    console.log(`✅ Updated ${updateResult.modifiedCount} questions. Subject set to null.`);
    console.log('ℹ️ Frontend will now show "—" for these questions.');
    console.log('💡 If you want a default subject like "General", you can run:');
    console.log('   db.questions.updateMany({ subject: null }, { $set: { subject: "General" } })');

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Ask for confirmation
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('⚠️  This script will set all questions with subject = "undefined" or "" to null.');
console.log('📌 This ensures the frontend displays "—" instead of "undefined".');
readline.question('Do you want to continue? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    readline.close();
    fixSubject();
  } else {
    console.log('❌ Operation cancelled.');
    readline.close();
    process.exit(0);
  }
});