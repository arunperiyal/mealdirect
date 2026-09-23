const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const changeRequestController = require('../controllers/changeRequestController');
const { verifyToken, authorize } = require('../middleware/auth');
const { payoutValidators } = require('../lib/payout');

// A delivery partner's own details. Open to riders still waiting for approval,
// unlike /api/delivery. Once approved, changes wait for an admin.
router.use(verifyToken, authorize(['delivery_partner']));

const handle = (fn) => async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', errors: errors.array() });
  }
  try {
    const data = await fn(req);
    res.status(data.applied === false ? 202 : 200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
    });
  }
};

/** GET /api/profile: personal and payout details, and any change waiting for review */
router.get('/', handle((req) => changeRequestController.getRiderProfile(req.user.id)));

/**
 * PUT /api/profile/personal   Body: { firstName, lastName?, phone }
 * PUT /api/profile/payout     Body: { bankAccountName, bankAccountNumber, bankIFSC, upiId }
 * data: { applied, changeRequest, profile }
 */
router.put(
  '/personal',
  [
    body('firstName').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Enter your first name'),
    body('lastName').optional({ values: 'null' }).isString().trim().isLength({ max: 100 }),
    body('phone').isString().trim().isMobilePhone().withMessage('Enter a valid phone number'),
  ],
  handle((req) =>
    changeRequestController.submitRiderChange(req.user.id, 'personal', {
      ...req.body,
      // An empty last name clears it
      lastName: req.body.lastName || null,
    })
  )
);

router.put('/payout', payoutValidators(), handle((req) => changeRequestController.submitRiderChange(req.user.id, 'payout', req.body)));

module.exports = router;
