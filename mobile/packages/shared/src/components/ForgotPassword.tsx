import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { errorMessage } from '../lib/errors';
import { validateEmail, validatePassword } from '../lib/validation';
import { colors, font, spacing } from '../theme';
import { AuthScreen } from './AuthScreen';
import { Button } from './Button';
import { Banner } from './States';
import { TextField } from './TextField';

interface Props {
  brand?: string;
  requestCode: (email: string) => Promise<void>;
  resetPassword: (input: { email: string; code: string; password: string }) => Promise<void>;
  // The app's own sign-in (with its role check), run with the new password
  signIn: (email: string, password: string) => Promise<void>;
  onBack: () => void;
  minPasswordLength?: number; // MealDirect staff: 12
}

// Forgot password: email → 6-digit code by email → code and a new password → signed in
export function ForgotPassword({ brand, requestCode, resetPassword, signIn, onBack, minPasswordLength = 8 }: Props) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; code?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setFormError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (again = false) => {
    const problem = validateEmail(email);
    setErrors({ email: problem });
    if (problem) return;
    run(async () => {
      await requestCode(email.trim());
      setStep('code');
      setNotice(
        again
          ? 'If you asked more than a minute ago, a new code is on its way.'
          : `If ${email.trim()} has a MealDirect account, we've emailed it a 6-digit code. It works for 15 minutes.`
      );
    });
  };

  const setNewPassword = () => {
    const next = {
      code: /^\d{6}$/.test(code.trim()) ? null : 'Enter the 6-digit code from the email',
      password:
        password.length < minPasswordLength
          ? `Password must be at least ${minPasswordLength} characters`
          : validatePassword(password),
    };
    setErrors(next);
    if (next.code || next.password) return;
    run(async () => {
      await resetPassword({ email: email.trim(), code: code.trim(), password });
      // On success the app's layout moves to its signed-in screens
      await signIn(email.trim(), password);
    });
  };

  return (
    <AuthScreen
      brand={brand}
      title="Reset your password"
      subtitle={step === 'email' ? "We'll email you a code to set a new one" : 'Enter the code from the email and a new password'}
    >
      {formError && <Banner tone="error" message={formError} />}
      {notice && step === 'code' && <Banner tone="success" message={notice} />}
      {step === 'email' ? (
        <>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={() => sendCode()}
          />
          <Button title="Email me a code" onPress={() => sendCode()} loading={busy} style={styles.submit} />
        </>
      ) : (
        <>
          <TextField
            label="Code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            error={errors.code}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <TextField
            label="New password"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={setNewPassword}
          />
          <Button title="Set new password" onPress={setNewPassword} loading={busy} style={styles.submit} />
          <Pressable accessibilityRole="button" onPress={() => sendCode(true)} disabled={busy} hitSlop={8} style={styles.link}>
            <Text style={styles.linkText}>Send a new code</Text>
          </Pressable>
        </>
      )}
      <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8} style={styles.link}>
        <Text style={styles.linkText}>Back to sign in</Text>
      </Pressable>
      {step === 'code' && (
        <Text style={[font.caption, styles.hint]}>
          No email? Check your spam folder, and that {email.trim()} is the address you signed up with.
        </Text>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  submit: { marginTop: spacing.sm },
  link: { alignSelf: 'center', paddingVertical: spacing.sm, marginTop: spacing.md },
  linkText: { color: colors.brand, fontSize: 15, fontWeight: '600' },
  hint: { textAlign: 'center', marginTop: spacing.md },
});
