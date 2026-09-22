import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing } from '@mealdirect/shared';

interface Props {
  label: string;
  value: string;
  highlight?: boolean;
  onPress?: () => void;
}

export function StatTile({ label, value, highlight, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, highlight && styles.highlight, pressed && { opacity: 0.9 }]}
    >
      <Text style={[styles.value, highlight && styles.highlightText]}>{value}</Text>
      <Text style={[styles.label, highlight && styles.highlightText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  highlight: { backgroundColor: colors.brand },
  value: { fontSize: 26, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  label: { fontSize: 14, color: colors.textMuted },
  highlightText: { color: '#fff' },
});
