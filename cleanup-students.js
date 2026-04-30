// cleanup-students.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function cleanup() {
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await User.updateMany(
    { role: 'student', tutorApplication: { $exists: true } },
    { $unset: { tutorApplication: "" } }
  );
  console.log(`Removed tutorApplication from ${result.modifiedCount} students`);
  process.exit(0);
}
cleanup();