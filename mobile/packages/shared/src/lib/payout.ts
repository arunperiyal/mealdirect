import type { ChangeRequest, PayoutDetails } from '../api/types';

// Mirrors backend/src/lib/payout.js. All four fields are required.
export const PAYOUT_FIELDS = ['upiId', 'bankAccountName', 'bankAccountNumber', 'bankIFSC'] as const;
export type PayoutField = (typeof PAYOUT_FIELDS)[number];
export type PayoutForm = Record<PayoutField, string>;
export type PayoutErrors = Partial<Record<PayoutField, string | null>>;

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI = /^[\w.-]{2,}@[a-zA-Z]{2,}$/;
const ACCOUNT_NUMBER = /^\d{9,18}$/;

export const payoutForm = (saved: Partial<Record<PayoutField, string | null>> = {}): PayoutForm => ({
  upiId: saved.upiId ?? '',
  bankAccountName: saved.bankAccountName ?? '',
  bankAccountNumber: saved.bankAccountNumber ?? '',
  bankIFSC: saved.bankIFSC ?? '',
});

// What the server expects: spaces out of the account number, IFSC in capitals
export const normalizePayout = (form: PayoutForm): PayoutDetails => ({
  upiId: form.upiId.trim(),
  bankAccountName: form.bankAccountName.trim(),
  bankAccountNumber: form.bankAccountNumber.replace(/\s/g, ''),
  bankIFSC: form.bankIFSC.trim().toUpperCase(),
});

export const validatePayout = (form: PayoutForm): PayoutErrors => {
  const v = normalizePayout(form);
  return {
    upiId: !v.upiId ? 'Enter a UPI ID' : UPI.test(v.upiId) ? null : 'UPI ID looks like name@bank',
    bankAccountName: v.bankAccountName.length >= 2 ? null : 'Enter the account holder name',
    bankAccountNumber: ACCOUNT_NUMBER.test(v.bankAccountNumber) ? null : 'Account number is 9 to 18 digits',
    bankIFSC: IFSC.test(v.bankIFSC) ? null : 'IFSC is 11 characters, like HDFC0001234',
  };
};

export const hasPayoutErrors = (errors: PayoutErrors) => Object.values(errors).some(Boolean);

export const isPayoutComplete = (saved: Partial<Record<PayoutField, string | null>>) =>
  PAYOUT_FIELDS.every((f) => Boolean(saved[f]));

// "Account ending 9012"
export const maskAccount = (number: string | null | undefined) =>
  number ? `Account ending ${number.slice(-4)}` : '';

const LABELS: Record<string, string> = {
  upiId: 'UPI ID',
  bankAccountName: 'account holder name',
  bankAccountNumber: 'account number',
  bankIFSC: 'IFSC',
  firstName: 'first name',
  lastName: 'last name',
  phone: 'phone',
};

// "UPI ID and IFSC"
export const changedFieldsLabel = (request: Pick<ChangeRequest, 'changes'>) => {
  const names = Object.keys(request.changes).map((f) => LABELS[f] ?? f);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};
