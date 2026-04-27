const User = require('../models/User');

async function updateTutorLevels() {
  console.log('🔄 Running tutor level progression check...');
  const tutors = await User.find({ role: 'tutor', isApproved: true });
  let updatedCount = 0;

  for (const tutor of tutors) {
    const profile = tutor.tutorProfile;
    let newLevel = profile.level || 'Entry-Level';
    const completed = profile.completedQuestions || 0;
    const avgRating = profile.rating || 0;
    const onTime = profile.onTimeDeliveryRate || 100;

    // Promotion logic
    if (newLevel === 'Entry-Level') {
      if (completed >= 5 && avgRating >= 4 && onTime >= 80) {
        newLevel = 'Skilled';
      }
    } else if (newLevel === 'Skilled') {
      if (completed >= 10 && avgRating >= 4.5 && onTime >= 85) {
        newLevel = 'Expert';
      }
    } else if (newLevel === 'Expert') {
      if (completed >= 30 && avgRating >= 4.7 && onTime >= 90) {
        newLevel = 'Premium';
      }
    } else if (newLevel === 'Premium') {
      // Demotion if quality drops significantly
      if (completed < 30 || avgRating < 4.8 || onTime < 90) {
        newLevel = 'Expert';
      }
    }

    if (newLevel !== profile.level) {
      profile.level = newLevel;
      if (!profile.levelHistory) profile.levelHistory = [];
      profile.levelHistory.push({ level: newLevel, date: new Date() });
      await tutor.save();
      console.log(`📈 Tutor ${tutor.email} promoted/demoted to ${newLevel}`);
      updatedCount++;
    }
  }
  console.log(`✅ Tutor level update finished. ${updatedCount} tutors changed.`);
}

module.exports = updateTutorLevels;