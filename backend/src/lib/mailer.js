/* eslint-disable no-console */
const nodemailer = require('nodemailer');
const config = require('../config');

// Emails "sent" without an SMTP server, newest last: tests read codes from here
const outbox = [];
let transport = null;

/**
 * Send a plain-text email through the SMTP server in the settings. Without one,
 * development and tests keep it in `outbox` (development also prints it to the log),
 * and production refuses, so a missing setting never looks like a sent email.
 */
const sendMail = async ({ to, subject, text, replyTo }) => {
  const { host, port, secure, user, pass, from } = config.mail;
  // Tests never send real email, whatever .env says
  if (!host || config.env === 'test') {
    if (config.env === 'production') {
      throw {
        code: 'EMAIL_NOT_CONFIGURED',
        message: "This server can't send email yet. Contact MealDirect support.",
        statusCode: 503,
      };
    }
    outbox.push({ to, subject, text, replyTo, at: new Date() });
    if (config.env !== 'test') console.info(`[mail] To: ${to}\n[mail] Subject: ${subject}\n${text}`);
    return;
  }
  transport ??= nodemailer.createTransport({ host, port, secure, ...(user && { auth: { user, pass } }) });
  await transport.sendMail({ from, to, subject, text, ...(replyTo && { replyTo }) });
};

module.exports = { sendMail, outbox };
