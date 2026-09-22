import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '@/theme';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export function Chip({ label, selected, onPress, disabled }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, selected && styles.selected, disabled && styles.disabled]}
    >
      <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  disabled: { opacity: 0.4 },
  text: { color: colors.text, fontSize: 14 },
  selectedText: { color: colors.brand, fontWeight: '600' },
});
