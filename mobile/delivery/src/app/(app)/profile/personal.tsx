import { useState } from 'react';
import { Text } from 'react-native';
import {
  ChangeRequestNotice,
  errorMessage,
  ErrorState,
  font,
  FormScreen,
  LoadingState,
  spacing,
  TextField,
  validateRequired,
  type RiderProfile,
} from '@mealdirect/shared';
import { useAppDispatch } from '@/store';
import { refreshProfile } from '@/store/authSlice';
import { useGetProfileQuery, useUpdatePersonalMutation } from '@/store/serverApi';

type Form = { firstName: string; lastName: string; phone: string };

// Mirrors the server: a mobile number, with an optional +country code
const validatePhone = (phone: string) =>
  /^\+?[0-9 ]{10,15}$/.test(phone.trim()) ? null : 'Enter a valid phone number';

const startingValues = (profile: RiderProfile): Form => {
  const pending = profile.changeRequests.personal;
  const values = pending?.status === 'pending' ? { ...profile, ...pending.changes } : profile;
  return { firstName: values.firstName ?? '', lastName: values.lastName ?? '', phone: values.phone ?? '' };
};

export default function PersonalScreen() {
  const { data: profile, error, refetch } = useGetProfileQuery();
  if (!profile) return error ? <ErrorState message={errorMessage(error)} onRetry={refetch} /> : <LoadingState />;
  // The form starts from the loaded values, then keeps what the rider types
  return <PersonalForm profile={profile} />;
}

function PersonalForm({ profile }: { profile: RiderProfile }) {
  const dispatch = useAppDispatch();
  const [update, { isLoading }] = useUpdatePersonalMutation();
  const [form, setForm] = useState<Form>(() => startingValues(profile));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string | null>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const set = (field: keyof Form) => (value: string) => {
    setSaved(null);
    setForm((f) => ({ ...f, [field]: value }));
  };

  const onSubmit = async () => {
    const next = { firstName: validateRequired(form.firstName, 'first name'), phone: validatePhone(form.phone) };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setError(null);
    try {
      const result = await update({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || null,
        phone: form.phone.replace(/\s/g, ''),
      }).unwrap();
      if (result.applied) {
        // The name and phone shown around the app come from the signed-in user
        await dispatch(refreshProfile());
        setSaved('Saved');
      } else {
        setSaved(
          result.changeRequest
            ? 'Sent to MealDirect. Your current details stay in use until the change is approved.'
            : 'Change withdrawn. Your current details stay as they are.'
        );
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <FormScreen submitTitle="Save" onSubmit={onSubmit} submitting={isLoading} error={error} success={saved}>
      {!saved && <ChangeRequestNotice request={profile.changeRequests.personal} />}
      <Text style={[font.caption, { marginBottom: spacing.lg }]}>
        Restaurants and customers see your name and phone number on orders you accept.
        {profile.riderStatus === 'pending' ? '' : ' MealDirect checks any change before it applies.'}
      </Text>
      <TextField label="First name" value={form.firstName} onChangeText={set('firstName')} error={errors.firstName} />
      <TextField label="Last name (optional)" value={form.lastName} onChangeText={set('lastName')} />
      <TextField
        label="Phone"
        value={form.phone}
        onChangeText={set('phone')}
        error={errors.phone}
        keyboardType="phone-pad"
        placeholder="98765 43210"
      />
      <Text style={font.caption}>Your email ({profile.email}) is your sign-in and can’t be changed here.</Text>
    </FormScreen>
  );
}
