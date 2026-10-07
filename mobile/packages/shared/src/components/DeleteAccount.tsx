import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { toApiError } from '../api/client';
import { colors, font, spacing } from '../theme';
import { SheetForm } from './SheetForm';
import { TextField } from './TextField';

interface Props {
  // What goes with the account, e.g. "Your restaurants are taken off MealDirect."
  consequence?: string;
  deleteAccount: (password: string) => Promise<void>;
  // Called once the account is gone; the app signs out locally
  onDeleted: () => void;
}

// A quiet "Delete account" link that opens a sheet asking for the password
export function DeleteAccount({ consequence, deleteAccount, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const close = () => {
    setOpen(false);
    setPassword('');
    setError(null);
  };

  const submit = async () => {
    if (!password) {
      setError('Enter your password to confirm');
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount(password);
      close();
      onDeleted();
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} hitSlop={8} style={styles.link}>
        <Text style={styles.linkText}>Delete account</Text>
      </Pressable>
      <SheetForm
        visible={open}
        title="Delete your account?"
        onClose={close}
        onSubmit={submit}
        submitTitle="Delete account"
        submitting={deleting}
        error={error}
      >
        <Text style={[font.body, styles.text]}>
          You won&apos;t be able to sign in, and you&apos;ll be signed out on every device.
          {consequence ? ` ${consequence}` : ''}
        </Text>
        <Text style={[font.caption, styles.text]}>
          Your order history is kept. To get the account back, contact MealDirect support.
        </Text>
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          onSubmitEditing={submit}
        />
      </SheetForm>
    </>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  linkText: { color: colors.danger, fontSize: 15, fontWeight: '500' },
  text: { marginBottom: spacing.md },
});
