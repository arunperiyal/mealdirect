import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Link } from 'expo-router';
import {
  AuthScreen,
  Banner,
  Button,
  colors,
  errorMessage,
  spacing,
  TextField,
  validateEmail,
} from '@mealdirect/shared';
import { useAppDispatch } from '@/store';
import { login } from '@/store/authSlice';

export default function SignInScreen() {
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    const next = {
      email: validateEmail(email),
      password: password ? null : 'Enter your password',
    };
    setErrors(next);
    if (next.email || next.password) return;

    setSubmitting(true);
    setFormError(null);
    try {
      // On success the root layout's guard swaps to the app screens
      await dispatch(login({ email: email.trim(), password })).unwrap();
    } catch (e) {
      setFormError(errorMessage(e));
      setSubmitting(false);
    }
  };

  return (
    <AuthScreen brand="MealDirect Partner" title="Welcome back" subtitle="Manage your menus and orders">
      {formError && <Banner tone="error" message={formError} />}
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      <Button title="Sign in" onPress={onSubmit} loading={submitting} style={styles.submit} />
      <Text style={styles.footer}>
        New restaurant partner?{' '}
        <Link href="/register" replace style={styles.link}>
          Create an account
        </Link>
      </Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  submit: { marginTop: spacing.sm },
  footer: { textAlign: 'center', marginTop: spacing.xl, color: colors.textMuted, fontSize: 15 },
  link: { color: colors.brand, fontWeight: '600' },
});
