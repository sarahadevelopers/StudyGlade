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
const Notification = require('../models/Notification');   // <-- NEW
const { upload } = require('../server');

const router = express.Router();
// Helper: generate signed URL for private Cloudinary files (answers etc.)
function getSignedUrl(publicUrl, options = {}) {
  if (!publicUrl) return null;
  // Extract public_id from a Cloudinary URL
  // Example: https://res.cloudinary.com/.../studyglade/answers/abc123.pdf
  const matches = publicUrl.match(/\/upload\/(?:v\d+\/)?(.+)/);
  if (!matches) return publicUrl;
  const publicId = matches[1].split('.')[0];
  // Determine resource_type: if PDF or other raw, use 'raw'; for images use 'image'
  const resourceType = publicId.match(/\.(pdf|doc|docx|xls|xlsx|txt)$/i) ? 'raw' : 'image';
  const signed = cloudinary.url(publicId, {
    sign_url: true,
    secure: true,
    resource_type: resourceType,
    ...options
  });
  return signed;
}
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper to get tutor information (fullName, avatar, gender, rating)
async function getTutorInfo(tutorId) {
  const tutor = await User.findById(tutorId).select('fullName avatar gender tutorProfile.rating');
  return tutor;
}

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
      .populate('studentId', 'fullName avatar gender')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await Question.countDocuments({ status: 'pending' });
    res.json({ questions, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 3. My questions (student) – now populates tutor avatar & rating -------------------
router.get('/my-questions', auth, roleCheck('student'), async (req, res) => {
  try {
    const questions = await Question.find({ studentId: req.userId })
      .populate('tutorId', 'fullName avatar gender tutorProfile.rating');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 4. My assignments (tutor) – also populates additionalFundsRequest -------------------
router.get('/my-assignments', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const questions = await Question.find({ tutorId: req.userId })
      .populate('studentId', 'fullName avatar gender')
      .select('+additionalFundsRequest');
    // Add signed URL for answerFile if exists
    const enriched = questions.map(q => {
      const obj = q.toObject();
      if (obj.answerFile) {
        obj.answerFileSigned = getSignedUrl(obj.answerFile);
      }
      return obj;
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 5. Get single question (UPDATED to allow tutor preview for pending) -------------------
router.get('/:id', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id)
      .populate('studentId', 'fullName avatar gender')
      .populate('tutorId', 'fullName avatar gender tutorProfile.rating');
    if (!question) return res.status(404).json({ error: 'Question not found' });
    const user = await User.findById(req.userId);
    const isStudent = question.studentId._id.toString() === req.userId;
    const isAssignedTutor = question.tutorId && question.tutorId._id.toString() === req.userId;
    const isAdmin = user.role === 'admin';
    const isTutorPreview = user.role === 'tutor' && question.status === 'pending';
    if (!isStudent && !isAssignedTutor && !isAdmin && !isTutorPreview) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const obj = question.toObject();
    if (obj.answerFile) obj.answerFileSigned = getSignedUrl(obj.answerFile);
    res.json(obj);
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

    // Optional: notify student that tutor accepted
    const tutor = await User.findById(req.userId).select('fullName');
    await Notification.create({
      userId: question.studentId,
      type: 'question_posted',
      title: 'Tutor Assigned',
      message: `${tutor.fullName} has accepted your question "${question.title}".`,
      link: `/question-details.html?id=${question._id}`
    });

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

    // Notify student that answer is complete
    await Notification.create({
      userId: question.studentId,
      type: 'answer_uploaded',
      title: 'Question Completed',
      message: `Your question "${question.title}" has been completed by ${tutor.fullName}.`,
      link: `/answer-details.html?id=${question._id}`
    });

    res.json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 8. Place a bid (restrictions) + NOTIFICATION -------------------
router.post('/:id/bid', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const { amount, message } = req.body;
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.status !== 'pending') return res.status(400).json({ error: 'Question is no longer pending' });

    const existingBid = await Bid.findOne({ questionId: question._id, tutorId: req.userId });
    if (existingBid) return res.status(400).json({ error: 'You have already placed a bid on this question' });

    if (amount < question.budget) {
      return res.status(400).json({ error: `Bid cannot be less than student's budget ($${question.budget})` });
    }

    const bid = await Bid.create({
      questionId: question._id,
      tutorId: req.userId,
      amount,
      message
    });

    // 🔔 Notify student
    const tutor = await User.findById(req.userId).select('fullName');
    await Notification.create({
      userId: question.studentId,
      type: 'new_bid',
      title: 'New Bid',
      message: `${tutor.fullName} placed a bid of $${amount} on your question "${question.title}".`,
      link: `/question-details.html?id=${question._id}`
    });

    res.status(201).json(bid);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ------------------- 9. Accept budget suggestion (student) + NOTIFICATION -------------------
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

    // 🔔 Notify tutor
    const tutor = await User.findById(question.tutorId).select('fullName');
    await Notification.create({
      userId: question.tutorId,
      type: 'question_posted',
      title: 'Budget increased & you were assigned',
      message: `${student.fullName} increased the budget to $${question.budget} and assigned you to "${question.title}".`,
      link: `/question-details.html?id=${question._id}`
    });

    res.json({ message: 'Budget increased and tutor assigned', newBudget: question.budget });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 10. Upload answer (tutor) + NOTIFICATION -------------------
router.post('/:id/upload-answer', auth, roleCheck('tutor'), upload.single('answer'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.tutorId.toString() !== req.userId) return res.status(403).json({ error: 'Not your question' });
    if (question.status !== 'assigned') return res.status(400).json({ error: 'Question not assigned' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Upload to Cloudinary with auto resource type (handles PDFs, images, etc.)
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'studyglade/answers',
      resource_type: 'auto'
    });
    await fs.unlink(req.file.path);

    question.answerFile = result.secure_url;
    question.answerFileName = req.file.originalname;
    question.answerUploadedAt = new Date();
    await question.save();

    // 🔔 Notify student
    const tutor = await User.findById(req.userId).select('fullName');
    await Notification.create({
      userId: question.studentId,
      type: 'answer_uploaded',
      title: 'Answer Uploaded',
      message: `${tutor.fullName} has uploaded an answer for "${question.title}".`,
      link: `/answer-details.html?id=${question._id}`
    });

    res.json({ message: 'Answer uploaded', fileUrl: result.secure_url });
  } catch (err) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});
// ------------------- 11. Get bids for a question (student/admin) – populate tutor with avatar & rating -------------------
router.get('/:id/bids', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    const user = await User.findById(req.userId);
    const isStudent = question.studentId.toString() === req.userId;
    const isAdmin = user.role === 'admin';
    if (!isStudent && !isAdmin) return res.status(403).json({ error: 'Only the student can view bids' });
    const bids = await Bid.find({ questionId: question._id })
      .populate('tutorId', 'fullName avatar gender tutorProfile.rating tutorProfile.completedQuestions email');
    res.json(bids);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 12. Accept a specific bid (student) + NOTIFICATION -------------------
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

    // 🔔 Notify tutor that their bid was accepted
    const tutor = await User.findById(bid.tutorId).select('fullName');
    await Notification.create({
      userId: bid.tutorId,
      type: 'question_posted',
      title: 'Your bid was accepted!',
      message: `${tutor.fullName}, your bid of $${bidAmount} on "${question.title}" has been accepted.`,
      link: `/question-details.html?id=${question._id}`
    });

    res.json({ message: 'Bid accepted, tutor assigned', newBudget: question.budget });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 13. Student rates tutor (after completion) -------------------
router.post('/:id/rate', auth, roleCheck('student'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.status !== 'completed') return res.status(400).json({ error: 'Question not completed yet' });
    if (question.studentId.toString() !== req.userId) return res.status(403).json({ error: 'Not authorized' });

    const { score, feedback } = req.body;
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

    // 🔔 Notify student
    const tutor = await User.findById(req.userId).select('fullName');
    await Notification.create({
      userId: question.studentId,
      type: 'question_posted',
      title: 'Additional Funds Request',
      message: `${tutor.fullName} requests an additional $${amount} for "${question.title}". Reason: ${reason}`,
      link: `/question-details.html?id=${question._id}`
    });

    res.json({ message: 'Request sent to student' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 15. Student responds to additional funds request + NOTIFICATION -------------------
router.post('/:id/respond-funds-request', auth, roleCheck('student'), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.studentId.toString() !== req.userId) return res.status(403).json({ error: 'Not your question' });
    const request = question.additionalFundsRequest;
    if (!request || request.status !== 'pending') return res.status(400).json({ error: 'No pending request' });

    const { accept } = req.body;
    if (accept) {
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

      // 🔔 Notify tutor (approved)
      await Notification.create({
        userId: question.tutorId,
        type: 'funds_response',
        title: 'Funds Request Approved',
        message: `Your request for additional $${request.amount} on "${question.title}" was approved.`,
        link: `/question-details.html?id=${question._id}`
      });
    } else {
      request.status = 'rejected';
      // 🔔 Notify tutor (rejected)
      await Notification.create({
        userId: question.tutorId,
        type: 'funds_response',
        title: 'Funds Request Rejected',
        message: `Your request for additional $${request.amount} on "${question.title}" was rejected.`,
        link: `/question-details.html?id=${question._id}`
      });
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