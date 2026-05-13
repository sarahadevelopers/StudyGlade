const express = require('express');
const Question = require('../models/Question');
const User = require('../models/User');

const router = express.Router();

router.get('/:id', async (req, res) => {
  try {
    const question = await Question.findById(req.params.id)
      .populate('studentId', 'fullName')
      .populate('tutorId', 'fullName tutorProfile.rating');
    if (!question) return res.status(404).send('Question not found');

    // Only show completed or publicly visible questions? We'll show all 'completed' ones.
    // But you may also show 'assigned' ones? For SEO, best to show only completed.
    if (question.status !== 'completed') {
      return res.status(404).send('Question not available');
    }

    // Safe to render public page
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