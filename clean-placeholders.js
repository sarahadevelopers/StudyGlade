require('dotenv').config();
const mongoose = require('mongoose');

async function cleanPlaceholders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const result = await db.collection('questions').updateMany(
      {
        answerFile: { $regex: /placeholder\.pdf$/i },
        status: 'assigned'
      },
      {
        $set: {
          answerFile: '',
          answerFileName: '',
          answerUploadedAt: null
        }
      }
    );
    console.log(`✅ Reset ${result.modifiedCount} questions that had placeholder answer files.`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

cleanPlaceholders();