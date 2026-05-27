require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkPendingTutors() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const pendingTutors = await User.find(
      { role: 'tutor', 'tutorApplication.status': 'pending' },
      'fullName email tutorApplication.status tutorApplication.appliedAt'
    );

    console.log(`Found ${pendingTutors.length} pending tutor applications:`);
    console.log(JSON.stringify(pendingTutors, null, 2));

    // Also find all tutors with ANY tutorApplication object (to see missing status)
    const allTutorApps = await User.find(
      { role: 'tutor', tutorApplication: { $exists: true } },
      'fullName email tutorApplication.status'
    );
    console.log('\nAll tutors with tutorApplication object (status values):');
    allTutorApps.forEach(t => {
      console.log(`${t.fullName}: status = ${t.tutorApplication?.status || 'MISSING'}`);
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkPendingTutors();