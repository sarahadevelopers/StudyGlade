// migrate-user-fields.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User'); // adjust path to your User model

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Add gender field to users that don't have it
    const genderResult = await User.updateMany(
      { gender: { $exists: false } },
      { $set: { gender: 'other' } }
    );
    console.log(`Gender field added to ${genderResult.modifiedCount} users`);

    // Add avatar field to users that don't have it
    const avatarResult = await User.updateMany(
      { avatar: { $exists: false } },
      { $set: { avatar: '' } }
    );
    console.log(`Avatar field added to ${avatarResult.modifiedCount} users`);

    console.log('Migration complete');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrate();