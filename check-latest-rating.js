// check-latest-rating.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Question = require('./models/Question');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const tutorEmail = 'codewithkaranja@gmail.com';
  const tutor = await User.findOne({ email: tutorEmail });
  if (!tutor) {
    console.log('Tutor not found');
    process.exit(1);
  }
  const questions = await Question.find({ tutorId: tutor._id, status: 'completed' })
    .sort({ createdAt: -1 })
    .limit(5);
  console.log('Last 5 completed questions:');
  for (const q of questions) {
    console.log(`- ${q.title}: rating = ${q.rating?.score || 'none'}`);
  }
  process.exit(0);
}
check();