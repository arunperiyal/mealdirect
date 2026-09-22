import { useState } from 'react';
import { Text } from 'react-native';
import { errorMessage, font, spacing, TextField } from '@mealdirect/shared';
import { FormScreen } from '@/components/FormScreen';
import { useRestaurant } from '@/lib/useRestaurant';
import { validateIfsc, validateUpi } from '@/lib/validation';
import { useUpdateBankDetailsMutation } from '@/store/serverApi';

type Field = 'bankAccountName' | 'bankAccountNumber' | 'bankIFSC' | 'upiId';

export default function BankScreen() {
  const restaurant = useRestaurant();
  const [update, { isLoading }] = useUpdateBankDetailsMutation();
  const [form, setForm] = useState<Record<Field, string>>({
    bankAccountName: restaurant.bankAccountName ?? '',
    bankAccountNumber: restaurant.bankAccountNumber ?? '',
    bankIFSC: restaurant.bankIFSC ?? '',
    upiId: restaurant.upiId ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string | null>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const set = (field: Field) => (value: string) => {
    setSaved(null);
    setForm((f) => ({ ...f, [field]: value }));
  };

  const onSubmit = async () => {
    const accountNumber = form.bankAccountNumber.replace(/\s/g, '');
    const next = {
      bankAccountNumber: accountNumber && !/^\d{9,18}$/.test(accountNumber) ? 'Account numbers are 9 to 18 digits' : null,
      bankIFSC: validateIfsc(form.bankIFSC),
      upiId: validateUpi(form.upiId),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setError(null);
    try {
      // Only send what's filled in; the server keeps anything left out
      const values = {
        bankAccountName: form.bankAccountName.trim(),
        bankAccountNumber: accountNumber,
        bankIFSC: form.bankIFSC.trim().toUpperCase(),
        upiId: form.upiId.trim(),
      };
      await update({
        id: restaurant.id,
        ...Object.fromEntries(Object.entries(values).filter(([, v]) => v)),
      }).unwrap();
      setSaved('Saved');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <FormScreen submitTitle="Save payout details" onSubmit={onSubmit} submitting={isLoading} error={error} success={saved}>
      <Text style={[font.caption, { marginBottom: spacing.lg }]}>
        Where MealDirect sends money from online orders. Only you and MealDirect can see these.
      </Text>
      <TextField label="UPI ID" value={form.upiId} onChangeText={set('upiId')} error={errors.upiId} autoCapitalize="none" placeholder="kitchen@okbank" />
      <TextField label="Account holder name" value={form.bankAccountName} onChangeText={set('bankAccountName')} />
      <TextField
        label="Account number"
        value={form.bankAccountNumber}
        onChangeText={set('bankAccountNumber')}
        error={errors.bankAccountNumber}
        keyboardType="number-pad"
      />
      <TextField
        label="IFSC"
        value={form.bankIFSC}
        onChangeText={set('bankIFSC')}
        error={errors.bankIFSC}
        autoCapitalize="characters"
        placeholder="HDFC0001234"
        maxLength={11}
      />
    </FormScreen>
  );
}
