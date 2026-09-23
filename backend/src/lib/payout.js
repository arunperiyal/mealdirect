const { body } = require('express-validator');

// Where MealDirect sends a restaurant's or rider's money: a UPI ID and a bank account.
// The partner and rider apps check the same formats before sending.
const PAYOUT_FIELDS = ['bankAccountName', 'bankAccountNumber', 'bankIFSC', 'upiId'];

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI = /^[\w.-]{2,}@[a-zA-Z]{2,}$/;
const ACCOUNT_NUMBER = /^\d{9,18}$/;

// All four fields; `optional` makes the whole set optional (for creating a restaurant)
const payoutValidators = ({ optional = false } = {}) => {
  const field = (name) => (optional ? body(name).optional({ values: 'falsy' }) : body(name));
  return [
    field('bankAccountName').isString().trim().isLength({ min: 2, max: 100 })
      .withMessage('Enter the account holder name'),
    field('bankAccountNumber').isString().trim().matches(ACCOUNT_NUMBER)
      .withMessage('Account number is 9 to 18 digits'),
    field('bankIFSC').isString().trim().toUpperCase().matches(IFSC)
      .withMessage('IFSC is 11 characters, like HDFC0001234'),
    field('upiId').isString().trim().matches(UPI)
      .withMessage('UPI ID looks like name@bank'),
  ];
};

const pickPayout = (source) =>
  Object.fromEntries(PAYOUT_FIELDS.filter((f) => source[f]).map((f) => [f, source[f]]));

const hasPayout = (subject) => PAYOUT_FIELDS.every((f) => Boolean(subject[f]));

module.exports = { PAYOUT_FIELDS, payoutValidators, pickPayout, hasPayout };
