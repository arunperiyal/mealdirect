const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();
const dishController = require('../controllers/dishController');
const { verifyToken, authorize } = require('../middleware/auth');
const { MAX_QUANTITY, MAX_DAILY_LIMIT } = require('../lib/itemLimits');

// A restaurant's dish list, for its owner
router.use(verifyToken, authorize(['restaurant_admin']));

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

// optional: for updates, where only the fields sent change
const dishValidators = (optional) => {
  const field = (name) => (optional ? body(name).optional() : body(name));
  return [
    field('name').isString().trim().isLength({ min: 1, max: 255 }).withMessage('Enter a name'),
    field('price').isFloat({ min: 0 }).toFloat().withMessage('Enter a price of 0 or more'),
    body('description').optional().isString().trim(),
    body('maxPerOrder').optional({ values: 'null' }).isInt({ min: 1, max: MAX_QUANTITY }).toInt()
      .withMessage(`Limit per order is 1 to ${MAX_QUANTITY}`),
    body('maxPerDay').optional({ values: 'null' }).isInt({ min: 1, max: MAX_DAILY_LIMIT }).toInt()
      .withMessage(`Limit per day is 1 to ${MAX_DAILY_LIMIT}`),
  ];
};

/** GET /api/dishes?restaurantId=&archived=true — the list, by name; archived=true for removed dishes */
router.get(
  '/',
  [query('restaurantId').isUUID(), query('archived').optional().isBoolean().toBoolean()],
  handle((req) => dishController.listDishes(req.query.restaurantId, req.user.id, { archived: req.query.archived === true }))
);

/** POST /api/dishes   Body: { restaurantId, name, price, description?, maxPerOrder?, maxPerDay? } */
router.post(
  '/',
  [body('restaurantId').isUUID(), ...dishValidators(false)],
  handle((req) => dishController.createDish(req.body.restaurantId, req.user.id, req.body), 201)
);

/**
 * POST /api/dishes/import   Body: { restaurantId }
 * Add the dishes already on this restaurant's menus to its list. Declared before /:id.
 */
router.post('/import', [body('restaurantId').isUUID()], handle((req) => dishController.importFromMenus(req.body.restaurantId, req.user.id)));

/** PUT /api/dishes/:id — changes apply to menus made from now on */
router.put('/:id', [param('id').isUUID(), ...dishValidators(true)], handle((req) => dishController.updateDish(req.params.id, req.user.id, req.body)));

/** DELETE /api/dishes/:id — removes it from the list; menus and orders that used it are unchanged */
router.delete('/:id', [param('id').isUUID()], handle((req) => dishController.archiveDish(req.params.id, req.user.id)));

/** POST /api/dishes/:id/restore — puts a removed dish back on the list */
router.post('/:id/restore', [param('id').isUUID()], handle((req) => dishController.restoreDish(req.params.id, req.user.id)));

module.exports = router;
