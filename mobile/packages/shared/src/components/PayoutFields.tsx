import { TextField } from './TextField';
import type { PayoutErrors, PayoutField, PayoutForm } from '../lib/payout';

// The four payout fields, for a restaurant or a rider
export function PayoutFields({
  form,
  errors,
  onChange,
  upiPlaceholder = 'name@okbank',
}: {
  form: PayoutForm;
  errors: PayoutErrors;
  onChange: (field: PayoutField, value: string) => void;
  upiPlaceholder?: string;
}) {
  return (
    <>
      <TextField
        label="UPI ID"
        value={form.upiId}
        onChangeText={(v) => onChange('upiId', v)}
        error={errors.upiId}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={upiPlaceholder}
      />
      <TextField
        label="Account holder name"
        value={form.bankAccountName}
        onChangeText={(v) => onChange('bankAccountName', v)}
        error={errors.bankAccountName}
      />
      <TextField
        label="Account number"
        value={form.bankAccountNumber}
        onChangeText={(v) => onChange('bankAccountNumber', v)}
        error={errors.bankAccountNumber}
        keyboardType="number-pad"
      />
      <TextField
        label="IFSC"
        value={form.bankIFSC}
        onChangeText={(v) => onChange('bankIFSC', v)}
        error={errors.bankIFSC}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="HDFC0001234"
        maxLength={11}
      />
    </>
  );
}
