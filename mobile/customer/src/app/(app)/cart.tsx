import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Button,
  Card,
  colors,
  EmptyState,
  font,
  formatINR,
  spacing,
} from '@mealdirect/shared';
import { QuantityStepper } from '@/components/QuantityStepper';
import { useAppDispatch, useAppSelector } from '@/store';
import { addItem, decrementItem, selectCartSubtotal } from '@/store/cartSlice';

export default function CartScreen() {
  const dispatch = useAppDispatch();
  const cart = useAppSelector((s) => s.cart);
  const subtotal = useAppSelector(selectCartSubtotal);
  const insets = useSafeAreaInsets();

  if (cart.lines.length === 0 || !cart.menuId || !cart.restaurantId) {
    return (
      <EmptyState
        title="Your cart is empty"
        message="Add dishes from a restaurant's menu to get started."
        actionTitle="Browse restaurants"
        onAction={() => router.dismissTo('/')}
      />
    );
  }

  const { menuId, restaurantId, restaurantName, menuDate } = cart;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card title={restaurantName ?? 'Your order'}>
          {menuDate && <Text style={[font.caption, styles.date]}>Menu for {menuDate}</Text>}
          {cart.lines.map((line) => (
            <View key={line.menuItemId} style={styles.line}>
              <View style={styles.lineText}>
                <Text style={font.body}>{line.name}</Text>
                <Text style={font.caption}>{formatINR(line.price)} each</Text>
              </View>
              <QuantityStepper
                label={line.name}
                quantity={line.quantity}
                max={line.maxQuantity}
                onDecrement={() => dispatch(decrementItem(line.menuItemId))}
                onIncrement={() =>
                  dispatch(
                    addItem({
                      restaurantId,
                      restaurantName: restaurantName ?? '',
                      menuId,
                      menuDate: menuDate ?? '',
                      item: { id: line.menuItemId, name: line.name, price: line.price },
                      maxQuantity: line.maxQuantity,
                    })
                  )
                }
              />
              <Text style={styles.lineTotal}>{formatINR(line.price * line.quantity)}</Text>
            </View>
          ))}
        </Card>

        <View style={styles.subtotalRow}>
          <Text style={font.heading}>Item total</Text>
          <Text style={font.heading}>{formatINR(subtotal)}</Text>
        </View>
        <Text style={font.caption}>Taxes and delivery fee are added at checkout.</Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title="Proceed to checkout" onPress={() => router.push('/checkout')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg },
  date: { marginTop: -spacing.sm, marginBottom: spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  lineText: { flex: 1 },
  lineTotal: { minWidth: 72, textAlign: 'right', fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
