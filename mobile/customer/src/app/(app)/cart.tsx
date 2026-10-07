import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button, Card, colors, EmptyState, font, formatINR, relativeDay, spacing } from '@mealdirect/shared';
import { QuantityStepper } from '@/components/QuantityStepper';
import { useAppDispatch, useAppSelector } from '@/store';
import { addItem, decrementItem, menuSubtotal, selectCartSubtotal } from '@/store/cartSlice';

export default function CartScreen() {
  const dispatch = useAppDispatch();
  const cart = useAppSelector((s) => s.cart);
  const subtotal = useAppSelector(selectCartSubtotal);
  const insets = useSafeAreaInsets();

  if (cart.menus.length === 0 || !cart.restaurantId) {
    return (
      <EmptyState
        title="Your cart is empty"
        message="Add dishes from a restaurant's menu to get started."
        actionTitle="Browse restaurants"
        onAction={() => router.dismissTo('/')}
      />
    );
  }

  const { restaurantId, restaurantName } = cart;
  const several = cart.menus.length > 1;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[font.title, styles.restaurant]}>{restaurantName ?? 'Your order'}</Text>
        {several && (
          <Text style={[font.caption, styles.note]}>
            Each menu is a separate order, with its own delivery time and bill.
          </Text>
        )}
        {cart.menus.map((menu) => (
          <Card key={menu.menuId} title={`${menu.menuName} · ${relativeDay(menu.menuDate)}`}>
            {menu.lines.map((line) => (
              <View key={line.menuItemId} style={styles.line}>
                <View style={styles.lineText}>
                  <Text style={font.body}>{line.name}</Text>
                  <Text style={font.caption}>{formatINR(line.price)} each</Text>
                </View>
                <QuantityStepper
                  label={line.name}
                  quantity={line.quantity}
                  max={line.maxQuantity}
                  onDecrement={() => dispatch(decrementItem({ menuId: menu.menuId, menuItemId: line.menuItemId }))}
                  onIncrement={() =>
                    dispatch(
                      addItem({
                        restaurantId,
                        restaurantName: restaurantName ?? '',
                        menuId: menu.menuId,
                        menuName: menu.menuName,
                        menuDate: menu.menuDate,
                        item: { id: line.menuItemId, name: line.name, price: line.price },
                        maxQuantity: line.maxQuantity,
                      })
                    )
                  }
                />
                <Text style={styles.lineTotal}>{formatINR(line.price * line.quantity)}</Text>
              </View>
            ))}
            {several && <Text style={[font.caption, styles.menuTotal]}>Items {formatINR(menuSubtotal(menu))}</Text>}
          </Card>
        ))}

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
  restaurant: { marginBottom: spacing.xs },
  note: { marginBottom: spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  lineText: { flex: 1 },
  lineTotal: { minWidth: 72, textAlign: 'right', fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  menuTotal: { textAlign: 'right', marginTop: spacing.xs },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
