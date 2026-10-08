const config = require('../config');
const { sendMail } = require('../lib/mailer');

const SUBJECTS = {
  suggestion: 'Suggestion',
  feedback: 'Feedback',
  problem: 'Problem report',
};

/**
 * Email a message from the website's form to the MealDirect inbox. With the sender's
 * email as Reply-To, answering it in the inbox goes straight back to them.
 */
const send = async ({ kind, message, name, email }) => {
  const to = config.mail.feedbackTo;
  if (!to) {
    throw {
      code: 'FEEDBACK_NOT_CONFIGURED',
      message: "Messages can't be sent from here yet. Please email us instead.",
      statusCode: 503,
    };
  }
  const from = [name, email && `<${email}>`].filter(Boolean).join(' ') || 'someone who left no name or email';
  await sendMail({
    to,
    replyTo: email || undefined,
    subject: `MealDirect website: ${SUBJECTS[kind]}${name ? ` from ${name}` : ''}`,
    text: [`${SUBJECTS[kind]} from ${from}:`, '', message].join('\n'),
  });
};

module.exports = { send, KINDS: Object.keys(SUBJECTS) };
