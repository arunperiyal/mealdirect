const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { sendMail } = require('../lib/mailer');
const { emailKey } = require('../lib/email');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;
// Asking again within this time doesn't send another email
const RESEND_SECONDS = 60;
// System admins need longer passwords, as when they're created (scripts/create-admin.js)
const minLength = (user) => (user.role === 'system_admin' ? 12 : 8);

const wrap = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

/**
 * Email a 6-digit code to reset the password. The answer is the same whether or not the
 * email has an account, so this can't be used to find out who signed up.
 */
const requestReset = wrap(async (email) => {
  const user = await User.findOne({ where: { emailKey: emailKey(email) } });
  if (!user) return;
  const sentAt = user.passwordResetSentAt ? new Date(user.passwordResetSentAt).getTime() : 0;
  if (Date.now() - sentAt < RESEND_SECONDS * 1000) return;

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  user.passwordResetHash = await bcrypt.hash(code, 10);
  user.passwordResetExpiresAt = new Date(Date.now() + CODE_MINUTES * 60 * 1000);
  user.passwordResetSentAt = new Date();
  user.passwordResetAttempts = 0;
  await user.save();

  await sendMail({
    to: user.email,
    subject: `${code} is your MealDirect password reset code`,
    text: [
      `Hi ${user.firstName || 'there'},`,
      '',
      `Your code to reset your MealDirect password is ${code}. It works for ${CODE_MINUTES} minutes.`,
      '',
      "If you didn't ask to reset your password, ignore this email: your password stays the same.",
    ].join('\n'),
  });
});

const clearCode = (user) => {
  user.passwordResetHash = null;
  user.passwordResetExpiresAt = null;
  user.passwordResetAttempts = 0;
};

/**
 * Set a new password with the emailed code. A code works once, for 15 minutes and
 * 5 tries. Every other session of the account ends (see middleware/auth.js).
 */
const confirmReset = wrap(async ({ email, code, password }) => {
  const invalid = () => throwError('INVALID_CODE', 'That code is wrong or has expired. Ask for a new one.', 400);
  const user = await User.findOne({ where: { emailKey: emailKey(email) } });
  if (!user || !user.passwordResetHash) invalid();
  if (new Date(user.passwordResetExpiresAt) < new Date()) {
    clearCode(user);
    await user.save();
    invalid();
  }

  if (!(await bcrypt.compare(String(code), user.passwordResetHash))) {
    user.passwordResetAttempts += 1;
    const used = user.passwordResetAttempts >= MAX_ATTEMPTS;
    if (used) clearCode(user);
    await user.save();
    if (used) throwError('TOO_MANY_ATTEMPTS', 'Too many wrong codes. Ask for a new one.', 429);
    invalid();
  }

  if (String(password).length < minLength(user)) {
    throwError('WEAK_PASSWORD', `The password must be at least ${minLength(user)} characters`, 400);
  }
  clearCode(user);
  user.passwordHash = password; // hashed by the beforeUpdate hook, which also ends other sessions
  await user.save();
});

module.exports = { requestReset, confirmReset, CODE_MINUTES, MAX_ATTEMPTS };
