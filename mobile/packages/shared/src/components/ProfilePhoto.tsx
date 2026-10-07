import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { toApiError } from '../api/client';
import type { User } from '../api/types';
import { pickProfilePhoto } from '../lib/pickPhoto';
import { colors, font, spacing } from '../theme';
import { Avatar } from './Avatar';

interface Props {
  user: User;
  baseUrl: string;
  setAvatar: (image: string) => Promise<User>;
  removeAvatar: () => Promise<User>;
  // With the updated user, so the app can keep it
  onChange: (user: User) => void;
  size?: number;
}

export const displayName = (u: Pick<User, 'firstName' | 'lastName'>, fallback = 'MealDirect user') =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') || fallback;

// The user's own picture, with "Add photo" / "Change" and "Remove" below it
export function ProfilePhoto({ user, baseUrl, setAvatar, removeAvatar, onChange, size = 80 }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<User | null>) => {
    setError(null);
    setBusy(true);
    try {
      const updated = await action();
      if (updated) onChange(updated);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const change = () =>
    run(async () => {
      const image = await pickProfilePhoto();
      return image ? setAvatar(image) : null;
    });

  return (
    <View style={styles.container}>
      <Avatar name={displayName(user)} url={user.avatarUrl} baseUrl={baseUrl} size={size} />
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={change} disabled={busy} hitSlop={8}>
          <Text style={[styles.action, busy && styles.busy]}>
            {busy ? 'Saving…' : user.avatarUrl ? 'Change photo' : 'Add photo'}
          </Text>
        </Pressable>
        {user.avatarUrl && !busy ? (
          <Pressable accessibilityRole="button" onPress={() => run(removeAvatar)} hitSlop={8}>
            <Text style={[styles.action, styles.remove]}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.lg },
  action: { color: colors.brand, fontSize: 15, fontWeight: '600' },
  remove: { color: colors.textMuted },
  busy: { color: colors.textMuted },
  error: { ...font.caption, color: colors.danger, textAlign: 'center' },
});
