/* eslint-disable no-console */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { sendMail } = require('../lib/mailer');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;

const wrap = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

/**
 * Email a 6-digit code to confirm the account's email. Within a minute of the last one,
 * nothing is sent (409 RESEND_TOO_SOON says how long to wait).
 */
const sendCode = wrap(async (user) => {
  if (user.isVerified) throwError('ALREADY_VERIFIED', 'Your email is already verified', 409);
  const sentAt = user.verificationSentAt ? new Date(user.verificationSentAt).getTime() : 0;
  const wait = Math.ceil((sentAt + RESEND_SECONDS * 1000 - Date.now()) / 1000);
  if (wait > 0) throwError('RESEND_TOO_SOON', `Wait ${wait} seconds before asking for another code`, 409);

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  user.verificationToken = await bcrypt.hash(code, 10);
  user.verificationTokenExpiry = new Date(Date.now() + CODE_MINUTES * 60 * 1000);
  user.verificationSentAt = new Date();
  user.verificationAttempts = 0;
  await user.save();

  await sendMail({
    to: user.email,
    subject: `${code} is your MealDirect verification code`,
    text: [
      `Hi ${user.firstName || 'there'},`,
      '',
      `Welcome to MealDirect! Enter ${code} in the app to confirm your email. It works for ${CODE_MINUTES} minutes.`,
      '',
      "If you didn't sign up for MealDirect, ignore this email.",
    ].join('\n'),
  });
});

/** Right after sign-up: a failure to email mustn't fail the sign-up; the app can ask again */
const sendFirstCode = async (user) => {
  try {
    await sendCode(user);
  } catch (error) {
    console.error(`Verification email to ${user.email} failed:`, error.message);
  }
};

const resend = wrap(async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) throwError('NOT_FOUND', 'Account not found', 404);
  await sendCode(user);
});

/** Confirm the email with the code; returns the user, now verified */
const verify = wrap(async (userId, code) => {
  const user = await User.findByPk(userId);
  if (!user) throwError('NOT_FOUND', 'Account not found', 404);
  if (user.isVerified) return user;

  const invalid = () => throwError('INVALID_CODE', 'That code is wrong or has expired. Ask for a new one.', 400);
  if (!user.verificationToken || new Date(user.verificationTokenExpiry) < new Date()) invalid();
  if (!(await bcrypt.compare(String(code), user.verificationToken))) {
    user.verificationAttempts += 1;
    const used = user.verificationAttempts >= MAX_ATTEMPTS;
    if (used) {
      user.verificationToken = null;
      user.verificationTokenExpiry = null;
    }
    await user.save();
    if (used) throwError('TOO_MANY_ATTEMPTS', 'Too many wrong codes. Ask for a new one.', 429);
    invalid();
  }

  user.isVerified = true;
  user.verificationToken = null;
  user.verificationTokenExpiry = null;
  user.verificationAttempts = 0;
  await user.save();
  return user;
});

module.exports = { sendFirstCode, resend, verify, CODE_MINUTES };
