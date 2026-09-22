import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/theme';

interface Props {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  max?: number;
  label: string; // item name, for screen readers
}

export function QuantityStepper({ quantity, onIncrement, onDecrement, max, label }: Props) {
  const atMax = max !== undefined && quantity >= max;
  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove one ${label}`}
        onPress={onDecrement}
        hitSlop={8}
        style={styles.button}
      >
        <Text style={styles.symbol}>−</Text>
      </Pressable>
      <Text style={styles.quantity} accessibilityLabel={`${quantity} ${label} in cart`}>
        {quantity}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add one ${label}`}
        accessibilityState={{ disabled: atMax }}
        onPress={onIncrement}
        disabled={atMax}
        hitSlop={8}
        style={[styles.button, atMax && styles.disabled]}
      >
        <Text style={styles.symbol}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
  },
  button: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  symbol: { color: colors.brand, fontSize: 20, fontWeight: '600' },
  quantity: { minWidth: 24, textAlign: 'center', color: colors.brand, fontWeight: '700', fontSize: 16 },
});
