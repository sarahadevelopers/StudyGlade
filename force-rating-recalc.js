// force-rating-recalc.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Question = require('./models/Question');

async function recalc() {
  await mongoose.connect(process.env.MONGODB_URI);
  const tutor = await User.findOne({ email: 'codewithkaranja@gmail.com', role: 'tutor' });
  const allRatings = await Question.find({
    tutorId: tutor._id,
    status: 'completed',
    'rating.score': { $exists: true }
  });
  let sum = 0;
  for (const q of allRatings) sum += q.rating.score;
  const avg = allRatings.length ? sum / allRatings.length : 0;
  tutor.tutorProfile.rating = avg;
  await tutor.save();
  console.log(`New rating: ${avg.toFixed(1)} ⭐`);
  process.exit(0);
}
recalc();