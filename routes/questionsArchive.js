const express = require('express');
const Question = require('../models/Question');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50; // questions per page (good for SEO)
    const skip = (page - 1) * limit;

    const questions = await Question.find({ status: 'completed' })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('title _id updatedAt category');

    const total = await Question.countDocuments({ status: 'completed' });
    const totalPages = Math.ceil(total / limit);

    res.render('questions-archive', {
      questions,
      currentPage: page,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      prevPage: page - 1,
      nextPage: page + 1
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;