/**
 * Emails are stored as people type them (trimmed and lowercased), dots included. Accounts
 * are matched on `emailKey`, which also folds the addresses Gmail delivers to the same
 * inbox: dots and a +tag in the name don't count, and googlemail.com is gmail.com. So
 * periyal.arun@gmail.com and periyalarun@gmail.com are one account, shown as typed.
 */
const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'];

const cleanEmail = (email) => String(email ?? '').trim().toLowerCase();

const emailKey = (email) => {
  const clean = cleanEmail(email);
  const at = clean.lastIndexOf('@');
  if (at < 0) return clean;
  const name = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  if (!GMAIL_DOMAINS.includes(domain)) return clean;
  return `${name.split('+')[0].replaceAll('.', '')}@gmail.com`;
};

module.exports = { cleanEmail, emailKey };
