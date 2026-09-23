import { useState } from 'react';
import { Text } from 'react-native';
import {
  ChangeRequestNotice,
  errorMessage,
  font,
  FormScreen,
  hasPayoutErrors,
  normalizePayout,
  PayoutFields,
  payoutForm,
  spacing,
  validatePayout,
  type PayoutErrors,
  type PayoutField,
} from '@mealdirect/shared';
import { useRestaurant } from '@/lib/useRestaurant';
import { useUpdateBankDetailsMutation } from '@/store/serverApi';

export default function BankScreen() {
  const restaurant = useRestaurant();
  const [update, { isLoading }] = useUpdateBankDetailsMutation();
  const pending = restaurant.changeRequests?.payout;
  // A change waiting for review is what the owner last entered, so edit that
  const [form, setForm] = useState(() =>
    payoutForm(pending?.status === 'pending' ? { ...restaurant, ...pending.changes } : restaurant)
  );
  const [errors, setErrors] = useState<PayoutErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const onChange = (field: PayoutField, value: string) => {
    setSaved(null);
    setForm((f) => ({ ...f, [field]: value }));
  };

  const onSubmit = async () => {
    const next = validatePayout(form);
    setErrors(next);
    if (hasPayoutErrors(next)) return;
    setError(null);
    try {
      const result = await update({ id: restaurant.id, ...normalizePayout(form) }).unwrap();
      setSaved(
        result.applied
          ? 'Saved'
          : result.changeRequest
            ? 'Sent to MealDirect. Your current details stay in use until the change is approved.'
            : 'Change withdrawn. Your current details stay as they are.'
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <FormScreen submitTitle="Save payout details" onSubmit={onSubmit} submitting={isLoading} error={error} success={saved}>
      {!saved && <ChangeRequestNotice request={pending} />}
      <Text style={[font.caption, { marginBottom: spacing.lg }]}>
        Customers paying by UPI at the door pay this UPI ID. MealDirect sends your earnings to this bank account. Only
        you and MealDirect can see these.
        {restaurant.isApproved ? ' MealDirect checks any change before it applies.' : ' They’re needed for approval.'}
      </Text>
      <PayoutFields form={form} errors={errors} onChange={onChange} upiPlaceholder="kitchen@okbank" />
    </FormScreen>
  );
}
