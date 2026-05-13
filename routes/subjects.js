const express = require('express');
const User = require('../models/User');
const Document = require('../models/Document');
const Question = require('../models/Question');

const router = express.Router();

// Helper: convert subject name to URL-friendly slug
function slugify(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Helper: convert slug back to display name (capitalised)
function unslugify(slug) {
  return slug.split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ---------- INDEX: list all available subjects ----------
router.get('/', async (req, res) => {
  try {
    // Get distinct subjects from approved documents
    const docSubjects = await Document.distinct('subject', { isApproved: true });
    // Get distinct categories from completed questions (best for SEO)
    const questionCategories = await Question.distinct('category', { status: 'completed' });
    // Combine and remove duplicates
    const allSubjects = [...new Set([...docSubjects, ...questionCategories])].filter(Boolean);
    allSubjects.sort();

    res.render('subjects-index', {
      subjects: allSubjects,
      slugify
    });
  } catch (err) {
    console.error('Error in subjects index:', err);
    res.status(500).send('Server error');
  }
});

// ---------- INDIVIDUAL SUBJECT PAGE ----------
router.get('/:slug', async (req, res) => {
  const slug = req.params.slug;
  // Convert slug back to the actual subject name (as stored in database)
  const subjectName = unslugify(slug);

  try {
    // Fetch tutors offering this subject
    const tutors = await User.find({
      role: 'tutor',
      isApproved: true,
      'tutorProfile.subjects': { $in: [subjectName] }
    })
      .limit(10)
      .select('fullName avatar tutorProfile.rating');

    // Fetch approved documents in this subject
    const documents = await Document.find({
      isApproved: true,
      subject: subjectName
    })
      .limit(10)
      .select('title slug price previewImageUrl');

    // Fetch recent completed questions in this subject
    const questions = await Question.find({
      status: 'completed',
      $or: [{ category: subjectName }, { subject: subjectName }]
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title _id');

    // If no content at all, still show the page (but maybe a friendly message)
    res.render('subject', {
      subject: subjectName,
      slug,
      tutors,
      documents,
      questions
    });
  } catch (err) {
    console.error(`Error in subject page for ${subjectName}:`, err);
    res.status(500).send('Server error');
  }
});

module.exports = router;