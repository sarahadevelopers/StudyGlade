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
const { upload } = require('../server');  // use global multer

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ------------------- 1. Post a question (student only) -------------------
router.post('/', auth, roleCheck('student'), upload.array('files', 5), async (req, res) => {
  try {
    const { title, description, category, subcategory, budget, deadline, school, course } = req.body;
    const budgetNum = parseFloat(budget);
    if (isNaN(budgetNum) || budgetNum <= 0) throw new Error('Invalid budget');

    const uploadedFiles = [];
    if (req.files && req.files.length) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, { folder: 'studyglade/questions' });
        uploadedFiles.push(result.secure_url);
        await fs.unlink(file.path);
      }
    }

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

    // Atomic deduction
    const user = await User.findOneAndUpdate(
      { _id: req.userId, walletBalance: { $gte: budgetNum } },
      { $inc: { walletBalance: -budgetNum } },
      { new: true }
    );
    if (!user) {
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

// ------------------- 2. Get pending questions (tutor) with pagination -------------------
router.get('/pending', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const questions = await Question.find({ status: 'pending' })
      .populate('studentId', 'fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await Question.countDocuments({ status: 'pending' });
    res.json({ questions, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 3. My questions (student) -------------------
router.get('/my-questions', auth, roleCheck('student'), async (req, res) => {
  try {
    const questions = await Question.find({ studentId: req.userId }).populate('tutorId', 'fullName');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 4. My assignments (tutor) – NOW INCLUDES additionalFundsRequest -------------------
router.get('/my-assignments', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const questions = await Question.find({ tutorId: req.userId })
      .populate('studentId', 'fullName')
      .select('+additionalFundsRequest');  // <-- ADD THIS LINE to expose funds request status
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 5. Get single question -------------------
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

// ------------------- 6. Tutor accepts question at existing budget -------------------
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

// ------------------- 7. Tutor marks complete (updates tutor stats) -------------------
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
    // Update tutor stats
    tutor.tutorProfile.completedQuestions = (tutor.tutorProfile.completedQuestions || 0) + 1;
    tutor.tutorProfile.totalEarnings = (tutor.tutorProfile.totalEarnings || 0) + earnings;
    const wasOnTime = new Date() <= new Date(question.deadline);
    const totalCompleted = tutor.tutorProfile.completedQuestions;
    const prevRate = tutor.tutorProfile.onTimeDeliveryRate || 100;
    const newRate = ((prevRate * (totalCompleted - 1)) + (wasOnTime ? 100 : 0)) / totalCompleted;
    tutor.tutorProfile.onTimeDeliveryRate = Math.round(newRate);
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

// ------------------- 8. Place a bid (restrictions) -------------------
router.post('/:id/bid', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const { amount, message } = req.body;
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.status !== 'pending') return res.status(400).json({ error: 'Question is no longer pending' });

    // Check if tutor already bid
    const existingBid = await Bid.findOne({ questionId: question._id, tutorId: req.userId });
    if (existingBid) return res.status(400).json({ error: 'You have already placed a bid on this question' });

    // Cannot bid below student's budget
    if (amount < question.budget) {
      return res.status(400).json({ error: `Bid cannot be less than student's budget ($${question.budget})` });
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

// ------------------- 9. Accept budget suggestion (student) -------------------
router.post('/:id/accept-suggestion', auth, roleCheck('student'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (!question.suggestedBudget || !question.suggestedTutorId) {
      return res.status(400).json({ error: 'No budget suggestion available' });
    }
    if (question.status !== 'pending') return res.status(400).json({ error: 'Question is no longer pending' });

    const extraNeeded = question.suggestedBudget - question.budget;
    if (extraNeeded <= 0) return res.status(400).json({ error: 'Suggested budget is not higher' });

    const student = await User.findOneAndUpdate(
      { _id: req.userId, walletBalance: { $gte: extraNeeded } },
      { $inc: { walletBalance: -extraNeeded } },
      { new: true }
    );
    if (!student) return res.status(400).json({ error: `Need $${extraNeeded} more` });

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

// ------------------- 10. Upload answer (tutor) -------------------
router.post('/:id/upload-answer', auth, roleCheck('tutor'), upload.single('answer'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.tutorId.toString() !== req.userId) return res.status(403).json({ error: 'Not your question' });
    if (question.status !== 'assigned') return res.status(400).json({ error: 'Question not assigned' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const result = await cloudinary.uploader.upload(req.file.path, { folder: 'studyglade/answers' });
    await fs.unlink(req.file.path);

    question.answerFile = result.secure_url;
    question.answerFileName = req.file.originalname;
    question.answerUploadedAt = new Date();
    await question.save();

    res.json({ message: 'Answer uploaded', fileUrl: result.secure_url });
  } catch (err) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 11. Get bids for a question (student/admin) -------------------
router.get('/:id/bids', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    const user = await User.findById(req.userId);
    const isStudent = question.studentId.toString() === req.userId;
    const isAdmin = user.role === 'admin';
    if (!isStudent && !isAdmin) return res.status(403).json({ error: 'Only the student can view bids' });
    const bids = await Bid.find({ questionId: question._id }).populate('tutorId', 'fullName tutorProfile.rating tutorProfile.completedQuestions email');
    res.json(bids);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 12. Accept a specific bid (student) -------------------
router.post('/:id/accept-bid/:bidId', auth, roleCheck('student'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.status !== 'pending') return res.status(400).json({ error: 'Question already assigned/completed' });

    const bid = await Bid.findById(req.params.bidId);
    if (!bid || bid.questionId.toString() !== question._id.toString()) return res.status(404).json({ error: 'Bid not found' });
    if (bid.accepted) return res.status(400).json({ error: 'Bid already accepted' });

    const originalBudget = question.budget;
    const bidAmount = bid.amount;

    if (bidAmount > originalBudget) {
      const extra = bidAmount - originalBudget;
      const student = await User.findOneAndUpdate(
        { _id: req.userId, walletBalance: { $gte: extra } },
        { $inc: { walletBalance: -extra } },
        { new: true }
      );
      if (!student) return res.status(400).json({ error: `Need $${extra} more` });
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
        description: `Refund for lower bid on question: ${question.title}`,
        referenceId: question._id
      });
    }

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

// ------------------- 13. Student rates tutor (after completion) -------------------
// ------------------- 13. Student rates or updates rating -------------------
router.post('/:id/rate', auth, roleCheck('student'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.status !== 'completed') return res.status(400).json({ error: 'Question not completed yet' });
    if (question.studentId.toString() !== req.userId) return res.status(403).json({ error: 'Not authorized' });

    const { score, feedback } = req.body;
    console.log(`📝 Rating received for question ${question.title}: score = ${score}, feedback = ${feedback}`); // 👈 LOG

    if (score < 1 || score > 5) return res.status(400).json({ error: 'Rating must be 1-5' });

    question.rating = { score, feedback, createdAt: new Date() };
    await question.save();

    const tutor = await User.findById(question.tutorId);
    const allRatings = await Question.find({
      tutorId: tutor._id,
      status: 'completed',
      'rating.score': { $exists: true }
    });
    const avg = allRatings.reduce((sum, q) => sum + q.rating.score, 0) / allRatings.length;
    console.log(`🔄 Tutor ${tutor.email} average recalculated: ${avg} (based on ${allRatings.length} ratings)`); // 👈 LOG
    tutor.tutorProfile.rating = parseFloat(avg.toFixed(2));
    await tutor.save();

    res.json({ message: 'Rating updated' });
  } catch (err) {
    console.error('Rating error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 14. Tutor requests additional funds (student must approve) -------------------
router.post('/:id/request-additional-funds', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.tutorId.toString() !== req.userId) return res.status(403).json({ error: 'Not your question' });
    if (question.status !== 'assigned') return res.status(400).json({ error: 'Question not in assigned state' });
    if (question.additionalFundsRequest && question.additionalFundsRequest.status === 'pending') {
      return res.status(400).json({ error: 'Request already pending' });
    }

    const { amount, reason } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    question.additionalFundsRequest = {
      amount,
      reason,
      status: 'pending',
      requestedAt: new Date()
    };
    await question.save();
    res.json({ message: 'Request sent to student' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 15. Student responds to additional funds request -------------------
router.post('/:id/respond-funds-request', auth, roleCheck('student'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.studentId.toString() !== req.userId) return res.status(403).json({ error: 'Not your question' });
    const request = question.additionalFundsRequest;
    if (!request || request.status !== 'pending') return res.status(400).json({ error: 'No pending request' });

    const { accept } = req.body; // boolean
    if (accept) {
      // Deduct extra from student wallet
      const student = await User.findOneAndUpdate(
        { _id: req.userId, walletBalance: { $gte: request.amount } },
        { $inc: { walletBalance: -request.amount } },
        { new: true }
      );
      if (!student) return res.status(400).json({ error: `Insufficient balance for $${request.amount}` });
      question.budget += request.amount;
      await Transaction.create({
        userId: req.userId,
        type: 'post_question_extra',
        amount: -request.amount,
        description: `Additional funds for question: ${question.title}`,
        referenceId: question._id
      });
      request.status = 'approved';
    } else {
      request.status = 'rejected';
    }
    request.studentResponseAt = new Date();
    await question.save();
    res.json({ message: accept ? 'Additional funds added' : 'Request rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 16. Tutor cancels assignment (ONLY after a REJECTED additional funds request) -------------------
router.post('/:id/cancel-assignment', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.tutorId.toString() !== req.userId) return res.status(403).json({ error: 'Not your question' });
    if (question.status !== 'assigned') return res.status(400).json({ error: 'Question not assigned' });

    // NEW RULE: cancellation allowed only if student has rejected a pending additional funds request
    const fundsReq = question.additionalFundsRequest;
    if (!fundsReq || fundsReq.status !== 'rejected') {
      return res.status(400).json({ error: 'Cancellation only allowed after student refuses an additional funds request.' });
    }

    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Cancellation reason required' });

    question.status = 'pending';
    question.tutorId = null;
    question.cancellationReason = reason;
    await question.save();

    res.json({ message: 'Assignment cancelled. No penalty.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;