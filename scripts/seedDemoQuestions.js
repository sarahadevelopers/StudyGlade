// scripts/seedDemoQuestions.js
require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('../models/Question');

const demoQuestions = [
  // Generate 100+ items; I'll provide a sample of 20, you can duplicate and modify.
  { title: "How does photosynthesis work? Explain in detail.", subject: "Biology", budget: 25, description: "Need a thorough explanation of the photosynthesis process including light-dependent and light-independent reactions." },
  { title: "Solve the quadratic equation: 2x² - 5x + 3 = 0", subject: "Math", budget: 18, description: "Show all steps, including factoring or quadratic formula." },
  { title: "Write a Python function to reverse a linked list.", subject: "Programming", budget: 30, description: "Write efficient code with O(n) time complexity." },
  { title: "Discuss the causes of World War I.", subject: "History", budget: 22, description: "Include militarism, alliances, imperialism, nationalism, and the assassination of Franz Ferdinand." },
  { title: "Explain the concept of supply and demand with examples.", subject: "Economics", budget: 20, description: "Use real-world examples to illustrate shifts in curves." },
  // ... add up to 100+ items. You can generate programmatically using loops.
];

async function seedDemoQuestions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await Question.deleteMany({ isDemo: true }); // remove previous demos
    const docs = demoQuestions.map(q => ({
      ...q,
      studentId: null, // no real student
      status: 'pending',
      isDemo: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    await Question.insertMany(docs);
    console.log(`Inserted ${docs.length} demo questions`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seedDemoQuestions();