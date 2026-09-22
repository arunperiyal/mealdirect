import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, font, spacing } from '@/theme';
import { Button } from './Button';

export function LoadingState() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={[font.heading, styles.text]}>Something went wrong</Text>
      <Text style={[font.caption, styles.text]}>{message}</Text>
      {onRetry && <Button title="Try again" variant="secondary" onPress={onRetry} style={styles.button} />}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  actionTitle,
  onAction,
}: {
  title: string;
  message?: string;
  actionTitle?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={[font.heading, styles.text]}>{title}</Text>
      {message && <Text style={[font.caption, styles.text]}>{message}</Text>}
      {actionTitle && onAction && (
        <Button title={actionTitle} onPress={onAction} style={styles.button} />
      )}
    </View>
  );
}

export function Banner({ tone, message }: { tone: 'error' | 'warning' | 'success'; message: string }) {
  const palette = {
    error: { backgroundColor: colors.brandSoft, color: colors.danger },
    warning: { backgroundColor: colors.warningSoft, color: colors.warning },
    success: { backgroundColor: colors.successSoft, color: colors.success },
  }[tone];
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: palette.backgroundColor }]}>
      <Text style={{ color: palette.color, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  text: { textAlign: 'center' },
  button: { marginTop: spacing.md, minWidth: 160 },
  banner: { padding: spacing.md, borderRadius: 8, marginBottom: spacing.md },
});
