require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI;
const QUESTION_ID = '6a05eb82c066ef0507c0abcf';
const CLOUDINARY_URL = 'https://res.cloudinary.com/df0fmqomw/raw/upload/v1778764931/studyglade/answers/at3jqr1jxq1fowymhwds';

async function fixQuestion() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const collection = db.collection('questions');
    
    const result = await collection.updateOne(
      { _id: new mongoose.Types.ObjectId(QUESTION_ID) },
      { $set: { 
        answerFile: CLOUDINARY_URL,
        answerFileName: 'temp.pdf',
        answerUploadedAt: new Date()
      }}
    );
    
    console.log('Update result:', result);
    if (result.modifiedCount === 1) {
      console.log('✅ Question updated successfully!');
    } else {
      console.log('⚠️ No document was updated. Check the question ID.');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

fixQuestion();