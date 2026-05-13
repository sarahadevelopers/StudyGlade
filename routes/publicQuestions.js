const express = require('express');
const Question = require('../models/Question');
const User = require('../models/User');

const router = express.Router();

// Redirect when no question ID is provided
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

    // Render public question page
    res.render('public-question', {
      question,
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
      createdAt: question.createdAt,
      completedAt: question.updatedAt
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;