const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const { body, param, query } = require('express-validator');
const { handleValidationErrors, sanitizeText, validateObjectId } = require('../middleware/validate');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const Question = require('../models/Question');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Bid = require('../models/Bid');
const Notification = require('../models/Notification');
const { upload } = require('../server');
const { sendEmailWithTemplate } = require('../utils/email');
const { emitToUser, getIO } = require('../utils/sockets');   // 👈 new import

const router = express.Router();
const multerMemory = multer({ storage: multer.memoryStorage() });

// ---------- Kenyan time helpers for demo questions ----------
function getNairobiHour() {
  const now = new Date();
  const nairobiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }));
  return nairobiTime.getHours();
}

function getDemoCount() {
  const hour = getNairobiHour();
  // Peak: 11pm (23) to 3am (3) – 4-6 questions
  if (hour >= 23 || hour < 3) return Math.floor(Math.random() * 3) + 4; // 4-6
  // Evening: 7pm (19) to 10pm (22) – 2-3 questions
  if (hour >= 19 && hour <= 22) return Math.floor(Math.random() * 2) + 2; // 2-3
  // Afternoon quiet (12pm-6pm) – rarely 0-1
  if (hour >= 12 && hour <= 18) return Math.random() < 0.3 ? 1 : 0;
  // Other times (morning, early night) – occasionally 1
  return Math.random() < 0.6 ? 1 : 0;
}

// ---------- generate signed URL for Cloudinary files ----------
function getSignedUrl(publicUrl, resourceType = 'image', expiresInSeconds = 300) {
  if (!publicUrl) return null;
  const match = publicUrl.match(/\/(?:raw\/)?upload\/(?:v\d+\/)?(.+)/);
  if (!match) return publicUrl;
  let publicId = match[1];
  const timestamp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const signature = cloudinary.utils.api_sign_request(
    { public_id: publicId, timestamp, resource_type: resourceType },
    process.env.CLOUDINARY_API_SECRET
  );
  return `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload/${publicId}?signature=${signature}&expires=${timestamp}&api_key=${process.env.CLOUDINARY_API_KEY}`;
}

function getResourceType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  return 'raw';
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper to get tutor information
async function getTutorInfo(tutorId) {
  const tutor = await User.findById(tutorId).select('fullName avatar gender tutorProfile.rating');
  return tutor;
}

// ------------------- 1. Post a question (student only) -------------------
router.post('/', 
  auth, 
  roleCheck('student'), 
  upload.array('files', 5),
  [
    sanitizeText('title').isLength({ min: 5, max: 200 }).withMessage('Title must be 5-200 characters'),
    sanitizeText('description').isLength({ min: 20 }).withMessage('Description must be at least 20 characters'),
    sanitizeText('category').notEmpty().withMessage('Category required'),
    sanitizeText('subcategory').optional(),
    body('budget').isFloat({ min: 3 }).withMessage('Budget must be at least $3'),
    body('deadline').isISO8601().withMessage('Invalid deadline'),
    sanitizeText('school').optional(),
    sanitizeText('course').optional()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { title, description, category, subcategory, budget, deadline, school, course } = req.body;
      const budgetNum = parseFloat(budget);
      if (isNaN(budgetNum) || budgetNum <= 0) throw new Error('Invalid budget');

      const uploadedFiles = [];
      if (req.files && req.files.length) {
        for (const file of req.files) {
          const resourceType = getResourceType(file.mimetype);
          const result = await cloudinary.uploader.upload(file.path, { 
            folder: 'studyglade/questions',
            resource_type: resourceType
          });
          uploadedFiles.push(result.secure_url);
          await fs.unlink(file.path);
        }
      }

      const question = await Question.create({
        studentId: req.userId,
        title, description, category, subcategory,
        budget: budgetNum, deadline, school, course,
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
        userId: req.userId, type: 'post_question', amount: -budgetNum,
        description: `Posted question: ${title}`, referenceId: question._id
      });

      // Emit real‑time wallet update
      const io = getIO(req);
      emitToUser(io, req.userId, 'wallet_update', {
        newBalance: user.walletBalance,
        transaction: { amount: -budgetNum, type: 'post_question' }
      });

      res.status(201).json(question);
    } catch (err) {
      if (req.files) {
        for (const file of req.files) await fs.unlink(file.path).catch(() => {});
      }
      res.status(400).json({ error: err.message });
    }
  }
);

// ------------------- 2. Get pending questions (tutor) -------------------
router.get('/pending', 
  auth, 
  roleCheck('tutor'),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // 1. Real pending questions (students' questions)
      const realFilter = { status: 'pending', isDemo: false };
      const realQuestions = await Question.find(realFilter)
        .populate('studentId', 'fullName avatar gender')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      const totalReal = await Question.countDocuments(realFilter);

      let allQuestions = [...realQuestions];

      // 2. Add demo questions for tutors (only if there are any)
      const demoCount = getDemoCount();
      if (demoCount > 0) {
        const demoQuestions = await Question.aggregate([
          { $match: { isDemo: true, status: 'pending' } },
          { $sample: { size: demoCount } }
        ]);
        allQuestions = [...allQuestions, ...demoQuestions];
      }

      res.json({
        questions: allQuestions,
        total: totalReal,   // pagination based only on real questions
        page,
        limit,
        pages: Math.ceil(totalReal / limit)
      });
    } catch (err) {
      console.error('Error in /pending:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ------------------- 3. My questions (student) -------------------
router.get('/my-questions', auth, roleCheck('student'), async (req, res) => {
  try {
    const questions = await Question.find({ studentId: req.userId })
      .populate('tutorId', 'fullName avatar gender tutorProfile.rating')
      .select('+additionalFundsRequest')
      .sort({ createdAt: -1 });
    res.json(questions);
  } catch (err) {
    console.error('❌ Error in /my-questions:', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 4. My assignments (tutor) -------------------
router.get('/my-assignments', auth, roleCheck('tutor'), async (req, res) => {
  try {
    const questions = await Question.find({ tutorId: req.userId })
      .populate('studentId', 'fullName avatar gender')
      .select('+additionalFundsRequest');
    const enriched = questions.map(q => {
      const obj = q.toObject();
      if (obj.answerFile) {
        obj.answerFileSigned = getSignedUrl(obj.answerFile, 'raw');
      }
      return obj;
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- 5. Get single question -------------------
router.get('/:id', 
  auth, 
  param('id').isMongoId().withMessage('Invalid question ID'),
  handleValidationErrors,
  async (req, res) => {
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
      if (obj.answerFile) {
        obj.answerFileSigned = getSignedUrl(obj.answerFile, 'raw');
      }
      res.json(obj);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ------------------- 6. Tutor accepts question -------------------
router.put('/:id/accept', 
  auth, 
  roleCheck('tutor'),
  param('id').isMongoId().withMessage('Invalid question ID'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const question = await Question.findById(req.params.id);
      if (!question) return res.status(404).json({ error: 'Question not found' });

      // ========== DEBUG LOGS ==========
      console.log('🔄 Accept called by tutor:', req.userId);
      console.log('📄 Question:', question._id, 'isDemo:', question.isDemo);
      console.log('🔒 restrictedTutors:', question.restrictedTutors || 'none');
      // =================================

      // ---------- Demo question: check restrictions first ----------
      if (question.isDemo) {
        // ✅ If the question has restricted tutors, check eligibility
        if (question.restrictedTutors && question.restrictedTutors.length > 0) {
          const isAllowed = question.restrictedTutors.some(id => id.toString() === req.userId);
          if (!isAllowed) {
            console.log('🚫 Tutor not allowed – returning restriction error');
            return res.status(403).json({
              error: 'restricted',
              message: 'This student has restricted this question to specific tutors only. You are not eligible to accept this question.'
            });
          }
        }
        // ✅ If allowed (or no restrictions), fake accept
        console.log(`🎭 Demo accept: tutor ${req.userId} accepted demo question ${question._id}`);
        return res.json({ message: 'Question accepted!', demo: true });
      }

      // ---------- Real accept logic (unchanged) ----------
      if (question.status !== 'pending') return res.status(400).json({ error: 'Question already assigned' });
      question.tutorId = req.userId;
      question.status = 'assigned';
      await question.save();

      const tutor = await User.findById(req.userId).select('fullName');
      await Notification.create({
        userId: question.studentId, type: 'question_posted',
        title: 'Tutor Assigned',
        message: `${tutor.fullName} has accepted your question "${question.title}".`,
        link: `/question-details.html?id=${question._id}`
      });

      const io = getIO(req);
      emitToUser(io, question.studentId, 'question_assigned', {
        questionId: question._id,
        questionTitle: question.title,
        tutorName: tutor.fullName
      });

      res.json(question);
    } catch (err) {
      console.error('Accept error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ------------------- 7. Tutor marks complete -------------------
router.put('/:id/complete', 
  auth, 
  roleCheck('tutor'),
  param('id').isMongoId().withMessage('Invalid question ID'),
  handleValidationErrors,
  async (req, res) => {
    try {
      // 👇 changed from const to let to allow reassignment
      let question = await Question.findById(req.params.id);
      if (!question) return res.status(404).json({ error: 'Question not found' });
      if (question.tutorId.toString() !== req.userId) return res.status(403).json({ error: 'Not your question' });

      // 👇 retry logic: if answerFile missing, wait 500ms and refresh
      if (!question.answerFile) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const refreshed = await Question.findById(req.params.id);
        if (refreshed && refreshed.answerFile) {
          question = refreshed;
        } else {
          return res.status(400).json({ error: 'Please upload the answer file first' });
        }
      }

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
        userId: req.userId, type: 'tutor_payment', amount: earnings,
        description: `Completed question: ${question.title}`, referenceId: question._id
      });

      await Notification.create({
        userId: question.studentId, type: 'answer_uploaded',
        title: 'Question Completed',
        message: `Your question "${question.title}" has been completed by ${tutor.fullName}.`,
        link: `/answer-details.html?id=${question._id}`
      });

      sendEmailWithTemplate(tutor.email, 'Payment Received – StudyGlade', 'tutor-payment.ejs', {
        tutorName: tutor.fullName,
        amount: earnings,
        reason: `Completed question: ${question.title}`
      }).catch(err => console.error('Failed to send payment email:', err));

      const io = getIO(req);
      emitToUser(io, question.studentId, 'question_completed', {
        questionId: question._id,
        questionTitle: question.title,
        tutorName: tutor.fullName
      });

      const obj = question.toObject();
      if (obj.answerFile) {
        obj.answerFileSigned = getSignedUrl(obj.answerFile, 'raw');
      }
      res.json(obj);
    } catch (err) {
      console.error('Complete error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);
// ------------------- 8. Place a bid -------------------
router.post('/:id/bid', 
  auth, 
  roleCheck('tutor'),
  param('id').isMongoId().withMessage('Invalid question ID'),
  [
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    sanitizeText('message').optional().isLength({ max: 500 }).withMessage('Message too long')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { amount, message } = req.body;
      const question = await Question.findById(req.params.id);
      if (!question) return res.status(404).json({ error: 'Question not found' });

      // ✅ Demo question: fake success – no real bid, just pretend
      if (question.isDemo) {
        console.log(`🎭 Demo bid: tutor ${req.userId} pretended to bid $${amount} on demo question ${question._id}`);
        return res.status(201).json({ 
          message: 'Bid placed successfully!', 
          demo: true,
          bid: { amount, message: message || '' }
        });
      }

      // ---------- Real bid logic (unchanged) ----------
      if (question.status !== 'pending') return res.status(400).json({ error: 'Question is no longer pending' });

      const existingBid = await Bid.findOne({ questionId: question._id, tutorId: req.userId });
      if (existingBid) return res.status(400).json({ error: 'You have already placed a bid on this question' });

      if (amount < question.budget) {
        return res.status(400).json({ error: `Bid cannot be less than student's budget ($${question.budget})` });
      }

      const bid = await Bid.create({
        questionId: question._id, tutorId: req.userId, amount, message
      });

      const tutor = await User.findById(req.userId).select('fullName');
      await Notification.create({
        userId: question.studentId, type: 'new_bid',
        title: 'New Bid',
        message: `${tutor.fullName} placed a bid of $${amount} on your question "${question.title}".`,
        link: `/question-details.html?id=${question._id}`
      });

      const student = await User.findById(question.studentId);
      sendEmailWithTemplate(student.email, 'New Bid on Your Question', 'bid-placed.ejs', {
        studentName: student.fullName,
        questionTitle: question.title,
        tutorName: tutor.fullName,
        tutorRating: tutor.tutorProfile?.rating?.toFixed(1) || 'New',
        bidAmount: amount,
        bidMessage: message || 'No message provided',
        questionId: question._id
      }).catch(err => console.error('Failed to send bid email:', err));

      const io = getIO(req);
      emitToUser(io, question.studentId, 'bid_placed', {
        questionId: question._id,
        questionTitle: question.title,
        tutorName: tutor.fullName,
        bidAmount: amount,
        message: message || ''
      });

      res.status(201).json(bid);
    } catch (err) {
      console.error('Bid error:', err);
      res.status(400).json({ error: err.message });
    }
  }
);

// ------------------- 9. Accept budget suggestion (student) -------------------
router.post('/:id/accept-suggestion', 
  auth, 
  roleCheck('student'),
  param('id').isMongoId().withMessage('Invalid question ID'),
  handleValidationErrors,
  async (req, res) => {
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
        { $inc: { walletBalance: -extraNeeded } }, { new: true }
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
        userId: req.userId, type: 'post_question_extra', amount: -extraNeeded,
        description: `Extra budget for question: ${question.title}`, referenceId: question._id
      });

      const tutor = await User.findById(question.tutorId).select('fullName');
      await Notification.create({
        userId: question.tutorId, type: 'question_posted',
        title: 'Budget increased & you were assigned',
        message: `${student.fullName} increased the budget to $${question.budget} and assigned you to "${question.title}".`,
        link: `/question-details.html?id=${question._id}`
      });

      // ✅ Socket: notify tutor that budget increased and they were assigned
      const io = getIO(req);
      emitToUser(io, question.tutorId, 'question_assigned', {
        questionId: question._id,
        questionTitle: question.title,
        newBudget: question.budget,
        studentName: student.fullName
      });

      // Also emit wallet update for student (balance decreased)
      emitToUser(io, req.userId, 'wallet_update', {
        newBalance: student.walletBalance,
        transaction: { amount: -extraNeeded, type: 'extra_funds' }
      });

      res.json({ message: 'Budget increased and tutor assigned', newBudget: question.budget });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ------------------- 10. Upload answer (tutor) -------------------
router.post('/:id/upload-answers', 
  auth, 
  roleCheck('tutor'), 
  multerMemory.array('answers', 10),   // up to 10 files, field name 'answers'
  param('id').isMongoId().withMessage('Invalid question ID'),
  handleValidationErrors,
  async (req, res) => {
    try {
      console.log(`[UPLOAD] Starting for question ${req.params.id}`);
      const question = await Question.findById(req.params.id);
      if (!question) return res.status(404).json({ error: 'Question not found' });
      if (question.tutorId.toString() !== req.userId) return res.status(403).json({ error: 'Not your question' });
      if (question.status !== 'assigned') return res.status(400).json({ error: 'Question not assigned' });
      if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

      console.log(`[UPLOAD] ${req.files.length} file(s) received`);

      const uploadedUrls = [];
      const uploadedFileNames = [];

      for (const file of req.files) {
        console.log(`[UPLOAD] Uploading: ${file.originalname}, size: ${file.size}`);
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: 'studyglade/answers', resource_type: 'raw' },
            (error, uploadResult) => {
              if (error) {
                console.error('[UPLOAD] Cloudinary error:', error);
                reject(error);
              } else {
                console.log('[UPLOAD] Cloudinary success:', uploadResult.secure_url);
                resolve(uploadResult);
              }
            }
          ).end(file.buffer);
        });
        uploadedUrls.push(result.secure_url);
        uploadedFileNames.push(file.originalname);
      }

      // Store as array in the question document
      const updated = await Question.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            answerFiles: uploadedUrls,
            answerFileNames: uploadedFileNames,
            answerUploadedAt: new Date()
          }
        },
        { new: true, runValidators: false }
      );

      console.log(`[UPLOAD] Updated document – answerFiles = ${updated.answerFiles?.length || 0} files`);

      // Notifications and emails (unchanged – adjust message to reflect multiple files)
      const tutor = await User.findById(req.userId).select('fullName');
      await Notification.create({
        userId: question.studentId,
        type: 'answer_uploaded',
        title: 'Answer Uploaded',
        message: `${tutor.fullName} has uploaded ${uploadedUrls.length} file(s) for "${question.title}".`,
        link: `/answer-details.html?id=${question._id}`
      });

      const student = await User.findById(question.studentId);
      sendEmailWithTemplate(student.email, 'Answer Uploaded for Your Question', 'answer-uploaded.ejs', {
        studentName: student.fullName,
        questionTitle: question.title,
        tutorName: tutor.fullName,
        fileCount: uploadedUrls.length,
        questionId: question._id
      }).catch(err => console.error('Failed to send email:', err));

      const io = getIO(req);
      emitToUser(io, question.studentId, 'answer_uploaded', {
        questionId: question._id,
        questionTitle: question.title,
        tutorName: tutor.fullName,
        fileUrls: uploadedUrls
      });

      res.json({ message: 'Answer(s) uploaded', fileUrls: uploadedUrls });
    } catch (err) {
      console.error('[UPLOAD] Error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ------------------- 11. Get bids for a question -------------------
router.get('/:id/bids', 
  auth, 
  param('id').isMongoId().withMessage('Invalid question ID'),
  handleValidationErrors,
  async (req, res) => {
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
  }
);

// ------------------- 12. Accept a specific bid (student) -------------------
router.post('/:id/accept-bid/:bidId', 
  auth, 
  roleCheck('student'),
  param('id').isMongoId().withMessage('Invalid question ID'),
  param('bidId').isMongoId().withMessage('Invalid bid ID'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const question = await Question.findById(req.params.id);
      if (!question) return res.status(404).json({ error: 'Question not found' });
      if (question.status !== 'pending') return res.status(400).json({ error: 'Question already assigned/completed' });

      const bid = await Bid.findById(req.params.bidId);
      if (!bid || bid.questionId.toString() !== question._id.toString()) return res.status(404).json({ error: 'Bid not found' });
      if (bid.accepted) return res.status(400).json({ error: 'Bid already accepted' });

      const originalBudget = question.budget;
      const bidAmount = bid.amount;

      let balanceChange = 0;
      let student = null;

      if (bidAmount > originalBudget) {
        const extra = bidAmount - originalBudget;
        student = await User.findOneAndUpdate(
          { _id: req.userId, walletBalance: { $gte: extra } },
          { $inc: { walletBalance: -extra } }, { new: true }
        );
        if (!student) return res.status(400).json({ error: `Need $${extra} more` });
        await Transaction.create({
          userId: req.userId, type: 'post_question_extra', amount: -extra,
          description: `Extra budget for accepted bid on question: ${question.title}`, referenceId: question._id
        });
        balanceChange = -extra;
        console.log(`💰 Student ${student.email} paid extra $${extra} for bid. New balance: ${student.walletBalance}`);
      } else if (bidAmount < originalBudget) {
        const refund = originalBudget - bidAmount;
        await User.updateOne({ _id: req.userId }, { $inc: { walletBalance: refund } });
        await Transaction.create({
          userId: req.userId, type: 'refund', amount: refund,
          description: `Refund for lower bid on question: ${question.title}`, referenceId: question._id
        });
        balanceChange = refund;
        // Re-fetch student to get updated balance
        student = await User.findById(req.userId);
        console.log(`💰 Student ${student.email} received refund $${refund}. New balance: ${student.walletBalance}`);
      } else {
        // No balance change, but we still need student object for possible socket emit (though balanceChange=0 → no emit)
        student = await User.findById(req.userId);
      }

      question.budget = bidAmount;
      question.tutorId = bid.tutorId;
      question.status = 'assigned';
      await question.save();

      bid.accepted = true;
      await bid.save();

      const tutor = await User.findById(bid.tutorId).select('fullName');
      await Notification.create({
        userId: bid.tutorId, type: 'question_posted',
        title: 'Your bid was accepted!',
        message: `${tutor.fullName}, your bid of $${bidAmount} on "${question.title}" has been accepted.`,
        link: `/question-details.html?id=${question._id}`
      });

      // Send email to tutor that their bid was accepted
      sendEmailWithTemplate(tutor.email, 'Your Bid Was Accepted!', 'bid-accepted.ejs', {
        tutorName: tutor.fullName,
        questionTitle: question.title,
        bidAmount: bidAmount,
        questionId: question._id
      }).catch(err => console.error('Failed to send bid accepted email:', err));

      // Socket: notify tutor that their bid was accepted
      const io = getIO(req);
      emitToUser(io, bid.tutorId, 'bid_accepted', {
        questionId: question._id,
        questionTitle: question.title,
        acceptedBidAmount: bidAmount
      });

      // Socket: also notify student wallet update if balance changed
      if (balanceChange !== 0 && student) {
        console.log(`📤 Emitting wallet_update to student ${student._id} (${student.email}) – new balance: ${student.walletBalance}`);
        emitToUser(io, req.userId, 'wallet_update', {
          newBalance: student.walletBalance,
          transaction: { amount: balanceChange, type: balanceChange < 0 ? 'extra_funds' : 'refund' }
        });
      } else {
        console.log(`ℹ️ No balance change for student (bid amount equals original budget), no wallet_update emitted.`);
      }

      res.json({ message: 'Bid accepted, tutor assigned', newBudget: question.budget });
    } catch (err) {
      console.error('Error in accept-bid:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ------------------- 13. Student rates tutor -------------------
router.post('/:id/rate', 
  auth, 
  roleCheck('student'),
  param('id').isMongoId().withMessage('Invalid question ID'),
  [
    body('score').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
    sanitizeText('feedback').optional().isLength({ max: 500 }).withMessage('Feedback too long')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const question = await Question.findById(req.params.id);
      if (!question) return res.status(404).json({ error: 'Question not found' });
      if (question.status !== 'completed') return res.status(400).json({ error: 'Question not completed yet' });
      if (question.studentId.toString() !== req.userId) return res.status(403).json({ error: 'Not authorized' });

      const { score, feedback } = req.body;
      question.rating = { score, feedback, createdAt: new Date() };
      await question.save();

      const tutor = await User.findById(question.tutorId);
      const allRatings = await Question.find({
        tutorId: tutor._id, status: 'completed', 'rating.score': { $exists: true }
      });
      const avg = allRatings.reduce((sum, q) => sum + q.rating.score, 0) / allRatings.length;
      tutor.tutorProfile.rating = parseFloat(avg.toFixed(2));
      await tutor.save();

      // ✅ Socket: notify tutor about new rating (optional)
      const io = getIO(req);
      emitToUser(io, tutor._id, 'rating_updated', {
        newRating: tutor.tutorProfile.rating,
        questionTitle: question.title
      });

      res.json({ message: 'Rating updated' });
    } catch (err) {
      console.error('Rating error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ------------------- 14. Tutor requests additional funds -------------------
router.post('/:id/request-additional-funds', 
  auth, 
  roleCheck('tutor'),
  param('id').isMongoId().withMessage('Invalid question ID'),
  [
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    sanitizeText('reason').optional().isLength({ max: 300 }).withMessage('Reason too long')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const question = await Question.findById(req.params.id);
      if (!question) return res.status(404).json({ error: 'Question not found' });
      if (question.tutorId.toString() !== req.userId) return res.status(403).json({ error: 'Not your question' });
      if (question.status !== 'assigned') return res.status(400).json({ error: 'Question not in assigned state' });
      if (question.additionalFundsRequest && question.additionalFundsRequest.status === 'pending') {
        return res.status(400).json({ error: 'Request already pending' });
      }

      let { amount, reason } = req.body;
      amount = parseFloat(amount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount. Must be a positive number.' });
      }

      question.additionalFundsRequest = {
        amount, reason: reason || '', status: 'pending', requestedAt: new Date()
      };
      await question.save();

      const saved = await Question.findById(question._id).select('+additionalFundsRequest');
      console.log(`✅ Funds request saved for question ${question._id}: amount = ${saved.additionalFundsRequest.amount}, reason = ${saved.additionalFundsRequest.reason}`);

      const tutor = await User.findById(req.userId).select('fullName');
      await Notification.create({
        userId: question.studentId, type: 'question_posted',
        title: 'Additional Funds Request',
        message: `${tutor.fullName} requests an additional $${amount} for "${question.title}". Reason: ${reason}`,
        link: `/question-details.html?id=${question._id}`
      });

      // ✅ Socket: notify student about funds request
      const io = getIO(req);
      emitToUser(io, question.studentId, 'funds_requested', {
        questionId: question._id,
        questionTitle: question.title,
        amount,
        reason: reason || ''
      });

      res.json({ message: 'Request sent to student', amount });
    } catch (err) {
      console.error('Error in request-additional-funds:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ------------------- 15. Student responds to additional funds request -------------------
router.post('/:id/respond-funds-request', 
  auth, 
  roleCheck('student'),
  param('id').isMongoId().withMessage('Invalid question ID'),
  body('accept').isBoolean().withMessage('Accept must be true or false'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const question = await Question.findById(req.params.id);
      if (!question) return res.status(404).json({ error: 'Question not found' });
      if (question.studentId.toString() !== req.userId) return res.status(403).json({ error: 'Not your question' });
      const request = question.additionalFundsRequest;
      if (!request || request.status !== 'pending') return res.status(400).json({ error: 'No pending request' });

      const { accept } = req.body;
      let newBalance = null;
      let student = null;

      if (accept) {
        student = await User.findOneAndUpdate(
          { _id: req.userId, walletBalance: { $gte: request.amount } },
          { $inc: { walletBalance: -request.amount } }, { new: true }
        );
        if (!student) return res.status(400).json({ error: `Insufficient balance for $${request.amount}` });
        question.budget += request.amount;
        await Transaction.create({
          userId: req.userId, type: 'post_question_extra', amount: -request.amount,
          description: `Additional funds for question: ${question.title}`, referenceId: question._id
        });
        request.status = 'approved';
        await Notification.create({
          userId: question.tutorId, type: 'funds_response',
          title: 'Funds Request Approved',
          message: `Your request for additional $${request.amount} on "${question.title}" was approved.`,
          link: `/question-details.html?id=${question._id}`
        });
        newBalance = student.walletBalance;
        console.log(`💰 Student ${student.email} approved additional funds $${request.amount}. New balance: ${student.walletBalance}`);
      } else {
        request.status = 'rejected';
        await Notification.create({
          userId: question.tutorId, type: 'funds_response',
          title: 'Funds Request Rejected',
          message: `Your request for additional $${request.amount} on "${question.title}" was rejected.`,
          link: `/question-details.html?id=${question._id}`
        });
        console.log(`❌ Student rejected additional funds request of $${request.amount} for question ${question._id}`);
      }
      request.studentResponseAt = new Date();
      await question.save();

      // Socket: notify tutor about response
      const io = getIO(req);
      emitToUser(io, question.tutorId, 'funds_response', {
        questionId: question._id,
        accepted: accept,
        amount: request.amount
      });

      // If funds were deducted, update student wallet in real time
      if (accept && newBalance !== null && student) {
        console.log(`📤 Emitting wallet_update to student ${student._id} (${student.email}) – new balance: ${student.walletBalance}`);
        emitToUser(io, req.userId, 'wallet_update', {
          newBalance,
          transaction: { amount: -request.amount, type: 'extra_funds' }
        });
      } else if (!accept) {
        console.log(`ℹ️ No wallet_update because request was rejected.`);
      }

      res.json({ message: accept ? 'Additional funds added' : 'Request rejected' });
    } catch (err) {
      console.error('Error in respond-funds-request:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ------------------- 16. Tutor cancels assignment -------------------
router.post('/:id/cancel-assignment', 
  auth, 
  roleCheck('tutor'),
  param('id').isMongoId().withMessage('Invalid question ID'),
  sanitizeText('reason').notEmpty().withMessage('Cancellation reason required'),
  handleValidationErrors,
  async (req, res) => {
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

      // ✅ Socket: notify student that tutor cancelled
      const io = getIO(req);
      emitToUser(io, question.studentId, 'assignment_cancelled', {
        questionId: question._id,
        questionTitle: question.title,
        reason
      });

      res.json({ message: 'Assignment cancelled. No penalty.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ------------------- 17. Proxy download -------------------
const { Readable } = require('stream');
router.get('/:id/download-answer', 
  auth, 
  param('id').isMongoId().withMessage('Invalid question ID'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const question = await Question.findById(req.params.id);
      if (!question || !question.answerFile) {
        return res.status(404).json({ error: 'Answer file not found' });
      }

      const user = await User.findById(req.userId);
      const isStudent = question.studentId.toString() === req.userId;
      const isTutor = question.tutorId && question.tutorId.toString() === req.userId;
      if (!isStudent && !isTutor && user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const cloudinaryResponse = await fetch(question.answerFile);
      if (!cloudinaryResponse.ok) {
        console.error(`Cloudinary fetch error: ${cloudinaryResponse.status} for ${question.answerFile}`);
        return res.status(500).json({ error: 'Failed to fetch file from storage' });
      }

      let fileName = question.answerFileName;
      if (!fileName || fileName === 'undefined' || fileName.trim() === '') {
        const urlParts = question.answerFile.split('/');
        let lastPart = urlParts[urlParts.length - 1];
        lastPart = lastPart.split('?')[0];
        fileName = lastPart.includes('.') ? lastPart : `${lastPart}.pdf`;
        console.log(`⚠️ Missing original filename, using fallback: ${fileName}`);
      }
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', cloudinaryResponse.headers.get('content-type') || 'application/octet-stream');

      Readable.fromWeb(cloudinaryResponse.body).pipe(res);
    } catch (err) {
      console.error('Download proxy error:', err);
      res.status(500).json({ error: 'Download failed' });
    }
  }
);

module.exports = router;