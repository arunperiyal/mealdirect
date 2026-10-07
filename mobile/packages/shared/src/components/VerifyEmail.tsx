import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { User } from '../api/types';
import { errorMessage } from '../lib/errors';
import { colors, font, spacing } from '../theme';
import { AuthScreen } from './AuthScreen';
import { Button } from './Button';
import { Banner } from './States';
import { TextField } from './TextField';

interface Props {
  email: string;
  brand?: string;
  verify: (code: string) => Promise<User>;
  resend: () => Promise<void>;
  // With the verified user; the app then opens
  onVerified: (user: User) => void;
  onSignOut: () => void;
}

// After sign-up: enter the 6-digit code emailed to confirm the address
export function VerifyEmail({ email, brand, verify, resend, onVerified, onSignOut }: Props) {
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);

  const submit = async () => {
    const problem = /^\d{6}$/.test(code) ? null : 'Enter the 6-digit code from the email';
    setCodeError(problem);
    if (problem) return;
    setFormError(null);
    setBusy('verify');
    try {
      onVerified(await verify(code));
    } catch (e) {
      setFormError(errorMessage(e));
      setBusy(null);
    }
  };

  const sendAgain = async () => {
    setFormError(null);
    setNotice(null);
    setBusy('resend');
    try {
      await resend();
      setNotice(`A new code is on its way to ${email}.`);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthScreen brand={brand} title="Verify your email" subtitle={`We sent a 6-digit code to ${email}. It works for 15 minutes.`}>
      {formError && <Banner tone="error" message={formError} />}
      {notice && <Banner tone="success" message={notice} />}
      <TextField
        label="Code"
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        error={codeError}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Verify" onPress={submit} loading={busy === 'verify'} style={styles.submit} />
      <Pressable accessibilityRole="button" onPress={sendAgain} disabled={busy !== null} hitSlop={8} style={styles.link}>
        <Text style={styles.linkText}>Send a new code</Text>
      </Pressable>
      <Text style={[font.caption, styles.hint]}>
        No email? Check your spam folder. Wrong address? Sign out and create the account again.
      </Text>
      <Pressable accessibilityRole="button" onPress={onSignOut} hitSlop={8} style={styles.link}>
        <Text style={styles.linkText}>Sign out</Text>
      </Pressable>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  submit: { marginTop: spacing.sm },
  link: { alignSelf: 'center', paddingVertical: spacing.sm, marginTop: spacing.md },
  linkText: { color: colors.brand, fontSize: 15, fontWeight: '600' },
  hint: { textAlign: 'center', marginTop: spacing.md },
});
