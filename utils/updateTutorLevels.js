const User = require('../models/User');
const Breach = require('../models/Breach');   // new import

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
      const oldLevel = profile.level;
      profile.level = newLevel;
      if (!profile.levelHistory) profile.levelHistory = [];
      profile.levelHistory.push({ level: newLevel, date: new Date() });
      
      // If demotion (from Premium to Expert), log a breach
      if (oldLevel === 'Premium' && newLevel === 'Expert') {
        await Breach.create({
          userId: tutor._id,
          type: 'auto_demotion',
          reason: `Automatic demotion from Premium to Expert. Criteria not met: completed=${completed}, rating=${avgRating}, onTime=${onTime}`,
          severity: 'medium',
          createdAt: new Date()
        });
        console.log(`⚠️ Breach recorded for tutor ${tutor.email} due to demotion`);
      }
      
      await tutor.save();
      console.log(`📈 Tutor ${tutor.email} ${oldLevel} → ${newLevel}`);
      updatedCount++;
    }
  }
  console.log(`✅ Tutor level update finished. ${updatedCount} tutors changed.`);
}

module.exports = updateTutorLevels;