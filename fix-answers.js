require('dotenv').config();
const mongoose = require('mongoose');

// Replace this with an actual Cloudinary URL from a successful upload
// You can get one from a working question (e.g., from your Render logs or MongoDB)
const FALLBACK_URL = 'https://res.cloudinary.com/df0fmqomw/raw/upload/v1778764931/studyglade/answers/at3jqr1jxq1fowymhwds';
const FALLBACK_FILENAME = 'recovered.pdf';

const MONGO_URI = process.env.MONGODB_URI;

async function fixAnswerFiles() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const collection = db.collection('questions');

    // Find questions where answerFile is missing or empty
    const result = await collection.updateMany(
      {
        $or: [
          { answerFile: { $exists: false } },
          { answerFile: '' }
        ],
        status: 'assigned' // only fix assigned questions that are waiting for completion
      },
      {
        $set: {
          answerFile: FALLBACK_URL,
          answerFileName: FALLBACK_FILENAME,
          answerUploadedAt: new Date()
        }
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} questions.`);
    if (result.matchedCount === 0) {
      console.log('No questions missing answerFile.');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

fixAnswerFiles();