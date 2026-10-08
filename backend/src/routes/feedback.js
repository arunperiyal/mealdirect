const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const { feedbackLimiter } = require('../middleware/rateLimit');

/**
 * POST /api/feedback   Body: { kind, message, name?, email? }
 * The website's suggestions and feedback form; no account needed. `website` is a field
 * people don't see: a form that fills it in is a bot, and is told it worked.
 */
router.post(
  '/',
  feedbackLimiter,
  [
    body('kind').isIn(feedbackController.KINDS).withMessage('Choose suggestion, feedback or problem'),
    body('message').isString().trim().isLength({ min: 10, max: 3000 }).withMessage('Write at least a sentence (up to 3000 characters)'),
    body('name').optional({ values: 'falsy' }).isString().trim().isLength({ max: 80 }).withMessage('Name is too long'),
    body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Enter a valid email, or leave it empty').normalizeEmail({ gmail_remove_dots: false }),
  ],
  async (req, res) => {
    if (req.body.website) return res.json({ success: true });
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: errors.array()[0].msg, errors: errors.array() });
    }
    try {
      await feedbackController.send(req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        code: error.code || 'MAIL_FAILED',
        message: error.statusCode ? error.message : "Your message couldn't be sent. Please try again later.",
      });
    }
  }
);

module.exports = router;
