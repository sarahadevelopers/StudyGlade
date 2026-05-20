const express = require('express');
const Question = require('../models/Question');
const User = require('../models/User');

const router = express.Router();

router.get('/', (req, res) => {
  res.redirect('/document-library.html');
});

router.get('/:id', async (req, res) => {
  try {
    const question = await Question.findById(req.params.id)
      .populate('studentId', 'fullName')
      .populate('tutorId', 'fullName tutorProfile.rating');
    if (!question) return res.status(404).send('Question not found');

    // Only show completed questions for SEO
    if (question.status !== 'completed') {
      return res.status(404).send('Question not available');
    }

    // Create safe date copies (fallback to current date if missing)
    const safeCreatedAt = question.createdAt instanceof Date ? question.createdAt : new Date();
    const safeUpdatedAt = question.updatedAt instanceof Date ? question.updatedAt : new Date();

    // Render public question page
    res.render('public-question', {
      question: {
        ...question.toObject(),
        createdAt: safeCreatedAt,
        updatedAt: safeUpdatedAt
      },
      title: question.title,
      description: question.description,
      subject: question.category || question.subject || 'General',
      budget: question.budget,
      status: question.status,
      studentName: question.studentId?.fullName,
      tutorName: question.tutorId?.fullName,
      tutorRating: question.tutorId?.tutorProfile?.rating,
      answerText: question.answerFile ? 'Answer file available (login required to download)' : 'No answer yet',
      answerFileUrl: question.answerFile ? `/api/questions/${question._id}/download-answer` : null,
      createdAt: safeCreatedAt,
      completedAt: safeUpdatedAt
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;