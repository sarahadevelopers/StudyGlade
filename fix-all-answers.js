require('dotenv').config();
const mongoose = require('mongoose');

// Use a valid Cloudinary URL from a successful upload (copy from your DB or logs)
const DEFAULT_ANSWER_URL = 'https://res.cloudinary.com/df0fmqomw/raw/upload/v1778764931/studyglade/answers/at3jqr1jxq1fowymhwds';
const DEFAULT_FILENAME = 'recovered.pdf';

async function fixAll() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const result = await db.collection('questions').updateMany(
    {
      status: 'assigned',
      $or: [{ answerFile: { $exists: false } }, { answerFile: '' }]
    },
    {
      $set: {
        answerFile: DEFAULT_ANSWER_URL,
        answerFileName: DEFAULT_FILENAME,
        answerUploadedAt: new Date()
      }
    }
  );
  console.log(`✅ Fixed ${result.modifiedCount} questions.`);
  process.exit();
}
fixAll();