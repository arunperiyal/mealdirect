const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const addressController = require('../controllers/addressController');
const { verifyToken, authorize } = require('../middleware/auth');

// A customer's saved delivery addresses
router.use(verifyToken, authorize(['customer']));

const handle = (fn, status = 200) => async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', errors: errors.array() });
  }
  try {
    res.status(status).json({ success: true, data: await fn(req) });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
    });
  }
};

const label = () => body('label').isString().trim().isLength({ min: 1, max: 40 }).withMessage('Name it, e.g. Home');
const address = () =>
  body('address').isString().trim().isLength({ min: 5, max: 500 }).withMessage('Enter the full address');
const id = [param('id').isUUID()];

/** GET /api/addresses: most recently used first */
router.get('/', handle((req) => addressController.list(req.user.id)));

/** POST /api/addresses   Body: { label, address } (up to 10) */
router.post('/', [label(), address()], handle((req) => addressController.create(req.user.id, req.body), 201));

/** PUT /api/addresses/:id   Body: { label?, address? } */
router.put(
  '/:id',
  [...id, label().optional(), address().optional()],
  handle((req) => addressController.update(req.params.id, req.user.id, req.body))
);

/** DELETE /api/addresses/:id */
router.delete('/:id', id, handle((req) => addressController.remove(req.params.id, req.user.id)));

module.exports = router;
