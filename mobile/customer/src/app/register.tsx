import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { AuthScreen } from '@/components/AuthScreen';
import { Button } from '@/components/Button';
import { Banner } from '@/components/States';
import { TextField } from '@/components/TextField';
import { errorMessage } from '@/lib/errors';
import { validateEmail, validatePassword, validateRequired } from '@/lib/validation';
import { useAppDispatch } from '@/store';
import { register } from '@/store/authSlice';
import { colors, spacing } from '@/theme';

type Field = 'firstName' | 'lastName' | 'email' | 'password';

export default function RegisterScreen() {
  const dispatch = useAppDispatch();
  const [form, setForm] = useState<Record<Field, string>>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string | null>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: Field) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  const onSubmit = async () => {
    const next = {
      firstName: validateRequired(form.firstName, 'first name'),
      lastName: validateRequired(form.lastName, 'last name'),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSubmitting(true);
    setFormError(null);
    try {
      await dispatch(
        register({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          password: form.password,
        })
      ).unwrap();
    } catch (e) {
      setFormError(errorMessage(e));
      setSubmitting(false);
    }
  };

  return (
    <AuthScreen title="Create your account" subtitle="Order daily meals for delivery or pickup">
      {formError && <Banner tone="error" message={formError} />}
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField
            label="First name"
            value={form.firstName}
            onChangeText={set('firstName')}
            error={errors.firstName}
            autoComplete="given-name"
            textContentType="givenName"
          />
        </View>
        <View style={styles.half}>
          <TextField
            label="Last name"
            value={form.lastName}
            onChangeText={set('lastName')}
            error={errors.lastName}
            autoComplete="family-name"
            textContentType="familyName"
          />
        </View>
      </View>
      <TextField
        label="Email"
        value={form.email}
        onChangeText={set('email')}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Password"
        value={form.password}
        onChangeText={set('password')}
        error={errors.password}
        placeholder="At least 8 characters"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={onSubmit}
      />
      <Button title="Create account" onPress={onSubmit} loading={submitting} style={styles.submit} />
      <Text style={styles.footer}>
        Already have an account?{' '}
        <Link href="/sign-in" replace style={styles.link}>
          Sign in
        </Link>
      </Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  submit: { marginTop: spacing.sm },
  footer: { textAlign: 'center', marginTop: spacing.xl, color: colors.textMuted, fontSize: 15 },
  link: { color: colors.brand, fontWeight: '600' },
});
