import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

const STAR_COLOR = '#F5A623';
const LABELS = ['Poor', 'Not great', 'Okay', 'Good', 'Excellent'];

interface Props {
  value: number | null;
  // With onChange, the stars are buttons to pick a rating
  onChange?: (stars: number) => void;
  size?: number;
  label?: string; // what's being rated, for screen readers
}

// Five stars: shows a rating, or picks one
export function Stars({ value, onChange, size = 18, label = 'Rating' }: Props) {
  const filled = Math.round(value ?? 0);
  return (
    <View
      style={styles.row}
      accessibilityRole={onChange ? 'adjustable' : 'text'}
      accessibilityLabel={onChange ? label : `${label}: ${value ?? 0} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const star = (
          <Text style={{ fontSize: size, lineHeight: size * 1.2, color: n <= filled ? STAR_COLOR : colors.border }}>★</Text>
        );
        return onChange ? (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${n} star${n > 1 ? 's' : ''}, ${LABELS[n - 1]}`}
            accessibilityState={{ selected: n === filled }}
            onPress={() => onChange(n)}
            hitSlop={4}
            style={styles.button}
          >
            {star}
          </Pressable>
        ) : (
          <View key={n}>{star}</View>
        );
      })}
    </View>
  );
}

export const starLabel = (stars: number) => LABELS[stars - 1] ?? '';

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  button: { paddingHorizontal: 2 },
});
