const express = require('express');
const User = require('../models/User');
const Question = require('../models/Question');
const Document = require('../models/Document');

const router = express.Router();
const TUTORS_PER_PAGE = 24;

// ---------- PUBLIC TUTOR LIST (server‑rendered, paginated) ----------
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * TUTORS_PER_PAGE;

    const tutors = await User.find({ role: 'tutor', isApproved: true })
      .select('fullName avatar tutorProfile gender')
      .skip(skip)
      .limit(TUTORS_PER_PAGE);
    const total = await User.countDocuments({ role: 'tutor', isApproved: true });
    const totalPages = Math.ceil(total / TUTORS_PER_PAGE);

    res.render('tutors-list', {
      tutors,
      currentPage: page,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
      prevPage: page - 1,
      nextPage: page + 1
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ---------- INDIVIDUAL TUTOR PROFILE ----------
router.get('/:id', async (req, res) => {
  try {
    const tutor = await User.findById(req.params.id).select('-password -refreshToken -resetPasswordToken -resetPasswordExpires');
    if (!tutor || tutor.role !== 'tutor' || !tutor.isApproved) {
      return res.status(404).send('Tutor not found');
    }
    // Recent completed questions
    const questions = await Question.find({ tutorId: tutor._id, status: 'completed' })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title _id');
    // Uploaded approved documents
    const documents = await Document.find({ uploaderId: tutor._id, isApproved: true })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title slug price');
    res.render('tutor-profile', {
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