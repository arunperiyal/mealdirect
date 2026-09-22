import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { formatINR } from '@/lib/money';
import { useAppSelector } from '@/store';
import { selectCartCount, selectCartSubtotal } from '@/store/cartSlice';
import { colors, radius, spacing } from '@/theme';

// Floating "View cart" bar; renders nothing when the cart is empty
export function CartBar({ bottomInset = true }: { bottomInset?: boolean }) {
  const count = useAppSelector(selectCartCount);
  const subtotal = useAppSelector(selectCartSubtotal);
  const restaurantName = useAppSelector((s) => s.cart.restaurantName);
  const insets = useSafeAreaInsets();

  if (count === 0) return null;

  return (
    <View style={[styles.wrap, { paddingBottom: (bottomInset ? insets.bottom : 0) + spacing.md }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View cart, ${count} items, ${formatINR(subtotal)}`}
        onPress={() => router.push('/cart')}
        style={({ pressed }) => [styles.bar, pressed && { opacity: 0.9 }]}
      >
        <View>
          <Text style={styles.count}>
            {count} {count === 1 ? 'item' : 'items'} · {formatINR(subtotal)}
          </Text>
          {restaurantName && (
            <Text style={styles.sub} numberOfLines={1}>
              from {restaurantName}
            </Text>
          )}
        </View>
        <Text style={styles.cta}>View cart ›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: 'transparent' },
  bar: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  count: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sub: { color: '#fff', opacity: 0.85, fontSize: 12, maxWidth: 200 },
  cta: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
