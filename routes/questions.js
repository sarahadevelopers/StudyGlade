const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const Question = require('../models/Question');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Bid = require('../models/Bid');

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ dest: 'uploads/' });

// ----------------------------------------------------------------------
// 1. POST a question (student only) – with file uploads (atomic deduction)
// ----------------------------------------------------------------------
router.post('/', auth, roleCheck('student'), upload.array('files', 5), async (req, res) => {
  try {
    const { title, description, category, subcategory, budget, deadline, school, course } = req.body;
    const budgetNum = parseFloat(budget);
    if (isNaN(budgetNum) || budgetNum <= 0) throw new Error('Invalid budget');

    // Upload files
    const uploadedFiles = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, { folder: 'studyglade/questions' });
        uploadedFiles.push(result.secure_url);
        await fs.unlink(file.path);
      }
    }

    // Create question
    const question = await Question.create({
      studentId: req.userId,
      title,
      description,
      category,
      subcategory,
      budget: budgetNum,
      deadline,
      school,
      course,
      files: uploadedFiles
    });

    // Atomic deduction – only if balance >= budget
    const user = await User.findOneAndUpdate(
      { _id: req.userId, walletBalance: { $gte: budgetNum } },
      { $inc: { walletBalance: -budgetNum } },
      { new: true }
    );

    if (!user) {
      // Rollback: delete the question
      await Question.findByIdAndDelete(question._id);
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    await Transaction.create({
      userId: req.userId,
      type: 'post_question',
      amount: -budgetNum,
      description: `Posted question: ${title}`,
      referenceId: question._id
    });

    res.status(201).json(question);
  } catch (err) {
    if (req.files) {
      for (const file of req.files) await fs.unlink(file.path).catch(() => {});
    }
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 2. Get all pending questions (for tutors)
// ----------------------------------------------------------------------
router.get('/pending', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const questions = await Question.find({ status: 'pending' }).populate('studentId', 'fullName');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 3. Get student's own questions
// ----------------------------------------------------------------------
router.get('/my-questions', auth, roleCheck('student'), async (req, res) => {
  try {
    const questions = await Question.find({ studentId: req.userId }).populate('tutorId', 'fullName');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 4. Get tutor's assigned questions
// ----------------------------------------------------------------------
router.get('/my-assignments', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const questions = await Question.find({ tutorId: req.userId }).populate('studentId', 'fullName');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 5. Get single question by ID (with access control)
// ----------------------------------------------------------------------
router.get('/:id', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id)
      .populate('studentId', 'fullName')
      .populate('tutorId', 'fullName');
    if (!question) return res.status(404).json({ error: 'Question not found' });
    const user = await User.findById(req.userId);
    const isStudent = question.studentId._id.toString() === req.userId;
    const isTutor = question.tutorId && question.tutorId._id.toString() === req.userId;
    const isAdmin = user.role === 'admin';
    if (!isStudent && !isTutor && !isAdmin) return res.status(403).json({ error: 'Access denied' });
    res.json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 6. Tutor accepts a question at the existing budget
// ----------------------------------------------------------------------
router.put('/:id/accept', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.status !== 'pending') return res.status(400).json({ error: 'Question already assigned' });
    question.tutorId = req.userId;
    question.status = 'assigned';
    await question.save();
    res.json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 7. Tutor marks question as completed (pays 76% of budget)
// ----------------------------------------------------------------------
router.put('/:id/complete', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.tutorId.toString() !== req.userId) return res.status(403).json({ error: 'Not your question' });
    if (!question.answerFile) return res.status(400).json({ error: 'Please upload the answer file first' });

    question.status = 'completed';
    await question.save();

    const tutor = await User.findById(req.userId);
    const earnings = question.budget * 0.76;
    tutor.walletBalance += earnings;
    await tutor.save();

    await Transaction.create({
      userId: req.userId,
      type: 'tutor_payment',
      amount: earnings,
      description: `Completed question: ${question.title}`,
      referenceId: question._id
    });
    res.json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 8. Tutor places or updates a bid on a pending question
// ----------------------------------------------------------------------
router.post('/:id/bid', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const { amount, message } = req.body;
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.status !== 'pending') return res.status(400).json({ error: 'Question is no longer pending' });

    const existingBid = await Bid.findOne({ questionId: question._id, tutorId: req.userId });
    if (existingBid) {
      existingBid.amount = amount;
      existingBid.message = message || existingBid.message;
      await existingBid.save();
      return res.json(existingBid);
    }
    const bid = await Bid.create({
      questionId: question._id,
      tutorId: req.userId,
      amount,
      message
    });
    res.status(201).json(bid);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 9. Student accepts the suggested budget increase (from lowest bid) – atomic deduction
// ----------------------------------------------------------------------
router.post('/:id/accept-suggestion', auth, roleCheck('student'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (!question.suggestedBudget || !question.suggestedTutorId) {
      return res.status(400).json({ error: 'No budget suggestion available' });
    }
    if (question.status !== 'pending') return res.status(400).json({ error: 'Question is no longer pending' });

    const extraNeeded = question.suggestedBudget - question.budget;
    if (extraNeeded <= 0) return res.status(400).json({ error: 'Suggested budget is not higher than current budget' });

    // Atomic deduction
    const student = await User.findOneAndUpdate(
      { _id: req.userId, walletBalance: { $gte: extraNeeded } },
      { $inc: { walletBalance: -extraNeeded } },
      { new: true }
    );
    if (!student) return res.status(400).json({ error: `Insufficient balance. Need $${extraNeeded} more.` });

    question.budget = question.suggestedBudget;
    question.tutorId = question.suggestedTutorId;
    question.status = 'assigned';
    question.suggestedBudget = 0;
    question.suggestedTutorId = null;
    question.budgetSuggestionSent = true;
    await question.save();

    await Transaction.create({
      userId: req.userId,
      type: 'post_question_extra',
      amount: -extraNeeded,
      description: `Extra budget for question: ${question.title}`,
      referenceId: question._id
    });

    res.json({ message: 'Budget increased and tutor assigned', newBudget: question.budget });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 10. Tutor uploads answer file
// ----------------------------------------------------------------------
router.post('/:id/upload-answer', auth, roleCheck('tutor'), upload.single('answer'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.tutorId.toString() !== req.userId) return res.status(403).json({ error: 'Not your question' });
    if (question.status !== 'assigned') return res.status(400).json({ error: 'Question is not in assigned state' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const result = await cloudinary.uploader.upload(req.file.path, { folder: 'studyglade/answers' });
    await fs.unlink(req.file.path);

    question.answerFile = result.secure_url;
    question.answerFileName = req.file.originalname;
    question.answerUploadedAt = new Date();
    await question.save();

    res.json({ message: 'Answer uploaded successfully', fileUrl: result.secure_url });
  } catch (err) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 11. Get all bids for a specific question (student or admin only)
// ----------------------------------------------------------------------
router.get('/:id/bids', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    const user = await User.findById(req.userId);
    const isStudent = question.studentId.toString() === req.userId;
    const isAdmin = user.role === 'admin';
    if (!isStudent && !isAdmin) return res.status(403).json({ error: 'Only the student who posted the question can view bids' });
    const bids = await Bid.find({ questionId: question._id }).populate('tutorId', 'fullName tutorProfile.rating tutorProfile.completedQuestions email');
    res.json(bids);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------
// 12. Accept a specific bid (student only) – atomic deduction for extra amount
// ----------------------------------------------------------------------
router.post('/:id/accept-bid/:bidId', auth, roleCheck('student'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.status !== 'pending') return res.status(400).json({ error: 'Question already assigned or completed' });

    const bid = await Bid.findById(req.params.bidId);
    if (!bid || bid.questionId.toString() !== question._id.toString()) return res.status(404).json({ error: 'Bid not found' });
    if (bid.accepted) return res.status(400).json({ error: 'Bid already accepted' });

    const originalBudget = question.budget;
    const bidAmount = bid.amount;

    if (bidAmount > originalBudget) {
      const extra = bidAmount - originalBudget;
      // Atomic deduction for extra amount
      const student = await User.findOneAndUpdate(
        { _id: req.userId, walletBalance: { $gte: extra } },
        { $inc: { walletBalance: -extra } },
        { new: true }
      );
      if (!student) return res.status(400).json({ error: `Insufficient balance. Need $${extra} more.` });
      await Transaction.create({
        userId: req.userId,
        type: 'post_question_extra',
        amount: -extra,
        description: `Extra budget for accepted bid on question: ${question.title}`,
        referenceId: question._id
      });
    } else if (bidAmount < originalBudget) {
      const refund = originalBudget - bidAmount;
      await User.updateOne({ _id: req.userId }, { $inc: { walletBalance: refund } });
      await Transaction.create({
        userId: req.userId,
        type: 'refund',
        amount: refund,
        description: `Refund for lower accepted bid on question: ${question.title}`,
        referenceId: question._id
      });
    }

    // Update question
    question.budget = bidAmount;
    question.tutorId = bid.tutorId;
    question.status = 'assigned';
    await question.save();

    bid.accepted = true;
    await bid.save();

    res.json({ message: 'Bid accepted, tutor assigned', newBudget: question.budget });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;