require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Question = require('../models/Question');

// Generate 100+ unique demo questions (expand as needed)
const generateDemoQuestions = (studentId) => {
  const subjects = ['Biology', 'Math', 'Programming', 'History', 'Economics', 'Physics', 'Chemistry', 'English', 'Political Science'];
  const templates = [
    { title: "How does photosynthesis work? Explain in detail.", minBudget: 20, maxBudget: 30 },
    { title: "Solve the quadratic equation: 2x² - 5x + 3 = 0", minBudget: 15, maxBudget: 25 },
    { title: "Write a Python function to reverse a linked list.", minBudget: 25, maxBudget: 35 },
    { title: "Discuss the causes of World War I.", minBudget: 18, maxBudget: 28 },
    { title: "Explain the concept of supply and demand with examples.", minBudget: 16, maxBudget: 26 },
    // Add more templates as needed – you can loop to create many
  ];
  
  const demoQuestions = [];
  const now = new Date(); // current date and time (will be the same for all questions in this run)
  
  for (let i = 0; i < 120; i++) {
    const template = templates[i % templates.length];
    const subject = subjects[i % subjects.length];
    const budget = Math.floor(Math.random() * (template.maxBudget - template.minBudget + 1)) + template.minBudget;
    
    // Set createdAt to today, deadline to 3 days from today
    const createdAt = new Date(now);
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + 3);
    
    demoQuestions.push({
      title: `${template.title} (${i+1})`,
      subject,
      budget,
      description: `This is a practice question. ${template.title} Please provide a detailed answer.`,
      studentId,          // admin's ID (or any real user ID)
      isDemo: true,
      status: 'pending',
      createdAt: createdAt,
      deadline: deadline,
      updatedAt: new Date()
    });
  }
  return demoQuestions;
};
async function seedDemoQuestions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find a user to act as the "student" for demo questions (any existing user, e.g., an admin)
    let demoStudent = await User.findOne({ role: 'admin' });
    if (!demoStudent) {
      // If no admin exists, try any user
      demoStudent = await User.findOne();
      if (!demoStudent) {
        console.error('❌ No user found in database. Please create at least one user first.');
        process.exit(1);
      }
    }
    console.log(`📌 Using user ${demoStudent.fullName} (${demoStudent._id}) as student for demo questions`);

    // Delete existing demo questions (optional – start fresh)
    await Question.deleteMany({ isDemo: true });
    console.log('🗑️ Removed existing demo questions');

    const questions = generateDemoQuestions(demoStudent._id);
    await Question.insertMany(questions);
    console.log(`✅ Inserted ${questions.length} demo questions`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  }
}

seedDemoQuestions();