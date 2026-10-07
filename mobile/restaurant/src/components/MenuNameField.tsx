import { StyleSheet, View } from 'react-native';
import { Chip, spacing, TextField } from '@mealdirect/shared';

// Common names to pick with a tap; anything else can be typed ("Lunch – South Indian")
export const MENU_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

export const validateMenuName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return 'Name the menu, e.g. Lunch';
  if (trimmed.length > 60) return 'Keep the name under 60 characters';
  return null;
};

// A restaurant can run several menus a day, so each has a name customers see
export function MenuNameField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (name: string) => void;
  error?: string | null;
}) {
  return (
    <View>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {MENU_NAMES.map((name) => (
          <Chip key={name} label={name} selected={value.trim() === name} onPress={() => onChange(name)} />
        ))}
      </View>
      <TextField
        label="Menu name"
        value={value}
        onChangeText={onChange}
        error={error}
        placeholder="Lunch – South Indian"
        maxLength={60}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
});
