import { useState } from 'react';
import { Text } from 'react-native';
import {
  ChangeRequestNotice,
  errorMessage,
  ErrorState,
  font,
  FormScreen,
  hasPayoutErrors,
  LoadingState,
  normalizePayout,
  payoutForm,
  PayoutFields,
  spacing,
  validatePayout,
  type PayoutErrors,
  type PayoutField,
  type RiderProfile,
} from '@mealdirect/shared';
import { useGetProfileQuery, useUpdatePayoutMutation } from '@/store/serverApi';

// What the rider last entered: a change waiting for review, else the saved details
const startingValues = (profile: RiderProfile) => {
  const pending = profile.changeRequests.payout;
  return payoutForm(pending?.status === 'pending' ? { ...profile, ...pending.changes } : profile);
};

export default function PayoutScreen() {
  const { data: profile, error, refetch } = useGetProfileQuery();
  if (!profile) return error ? <ErrorState message={errorMessage(error)} onRetry={refetch} /> : <LoadingState />;
  // The form starts from the loaded values, then keeps what the rider types
  return <PayoutForm profile={profile} />;
}

function PayoutForm({ profile }: { profile: RiderProfile }) {
  const [update, { isLoading }] = useUpdatePayoutMutation();
  const [form, setForm] = useState(() => startingValues(profile));
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
      const result = await update(normalizePayout(form)).unwrap();
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
      {!saved && <ChangeRequestNotice request={profile.changeRequests.payout} />}
      <Text style={[font.caption, { marginBottom: spacing.lg }]}>
        Where MealDirect pays your tips and earnings. Only you and MealDirect can see these.
        {profile.riderStatus === 'pending' ? '' : ' MealDirect checks any change before it applies.'}
      </Text>
      <PayoutFields form={form} errors={errors} onChange={onChange} />
    </FormScreen>
  );
}
