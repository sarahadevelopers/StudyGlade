const express = require('express');
const User = require('../models/User');
const Document = require('../models/Document');
const Question = require('../models/Question');

const router = express.Router();

// Helper: map URL-friendly subject name to display name
const subjectMap = {
  'math-homework-help': { display: 'Mathematics', dbTerm: 'Mathematics' },
  'statistics-help': { display: 'Statistics', dbTerm: 'Statistics' },
  'nursing-assignment-help': { display: 'Nursing', dbTerm: 'Nursing' },
  'python-homework-help': { display: 'Python', dbTerm: 'Python' },
  'calculus-help': { display: 'Calculus', dbTerm: 'Calculus' },
  'essay-writing-help': { display: 'Essay Writing', dbTerm: 'Essay Writing' },
  'chemistry-tutor': { display: 'Chemistry', dbTerm: 'Chemistry' },
  'physics-help': { display: 'Physics', dbTerm: 'Physics' }
};

router.get('/:slug', async (req, res) => {
  const slug = req.params.slug;
  const subjectInfo = subjectMap[slug];
  if (!subjectInfo) {
    return res.status(404).send('Subject not found');
  }

  const subjectName = subjectInfo.display;
  const dbSubject = subjectInfo.dbTerm;

  // Fetch tutors who offer this subject
  const tutors = await User.find({
    role: 'tutor',
    isApproved: true,
    'tutorProfile.subjects': { $in: [dbSubject] }
  }).limit(10).select('fullName avatar tutorProfile.rating');

  // Fetch approved documents in this subject
  const documents = await Document.find({
    isApproved: true,
    subject: dbSubject
  }).limit(10).select('title slug price previewImageUrl');

  // Fetch recent questions in this subject (from category or subject field)
  const questions = await Question.find({
    status: { $in: ['pending', 'assigned', 'completed'] },
    $or: [{ category: dbSubject }, { subject: dbSubject }]
  }).sort({ createdAt: -1 }).limit(10).select('title _id');

  res.render('subject', {
    subject: subjectName,
    slug,
    tutors,
    documents,
    questions
  });
});

module.exports = router;