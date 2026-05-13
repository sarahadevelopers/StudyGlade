const express = require('express');
const User = require('../models/User');
const Question = require('../models/Question');
const Document = require('../models/Document');

const router = express.Router();

router.get('/:id', async (req, res) => {
  try {
    const tutor = await User.findById(req.params.id).select('-password -refreshToken -resetPasswordToken');
    if (!tutor || tutor.role !== 'tutor' || !tutor.isApproved) {
      return res.status(404).send('Tutor not found');
    }
    // Get recent completed questions
    const questions = await Question.find({ tutorId: tutor._id, status: 'completed' })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title _id');
    // Get uploaded documents
    const documents = await Document.find({ uploaderId: tutor._id, isApproved: true })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title slug price');
    res.render('tutor', {
      tutor,
      questions,
      documents,
      subjects: tutor.tutorProfile?.subjects || [],
      rating: tutor.tutorProfile?.rating || 0,
      completedCount: tutor.tutorProfile?.completedQuestions || 0,
      totalEarnings: tutor.tutorProfile?.totalEarnings || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;