// CSV for spreadsheets. Text that starts like a formula (=, +, -, @) gets a leading
// apostrophe, so a name like "=HYPERLINK(...)" shows as text instead of running.
const cell = (value) => {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// rows: arrays of cells; the first is the header. CRLF line ends, as Excel expects.
const toCsv = (rows) => rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';

module.exports = { toCsv, cell };
