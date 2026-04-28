// check-ratings.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Question = require('./models/Question');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected\n');

  const tutor = await User.findOne({ email: 'codewithkaranja@gmail.com', role: 'tutor' });
  if (!tutor) {
    console.log('Tutor not found');
    process.exit(1);
  }

  const ratedQuestions = await Question.find({
    tutorId: tutor._id,
    status: 'completed',
    'rating.score': { $exists: true }
  });

  console.log(`Found ${ratedQuestions.length} rated questions:\n`);
  for (const q of ratedQuestions) {
    console.log(`- Question: "${q.title}"`);
    console.log(`  Rating score: ${q.rating.score}`);
    console.log(`  Feedback: ${q.rating.feedback || 'none'}`);
    console.log(`  Rated at: ${q.rating.createdAt}\n`);
  }

  process.exit(0);
}

check();