import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, colors, font, formatINR, formatTime, radius, spacing, type Order } from '@mealdirect/shared';
import { cashToCollect, restaurantPlace } from '@/lib/riderSteps';

const STATUS: Partial<Record<Order['status'], { label: string; bg: string; fg: string }>> = {
  confirmed: { label: 'Being prepared', bg: colors.background, fg: colors.textMuted },
  preparing: { label: 'Being prepared', bg: colors.background, fg: colors.textMuted },
  ready: { label: 'Ready for pickup', bg: colors.successSoft, fg: colors.success },
  out_for_delivery: { label: 'On the way', bg: colors.brandSoft, fg: colors.brand },
  delivered: { label: 'Delivered', bg: colors.background, fg: colors.textMuted },
  cancelled: { label: 'Cancelled', bg: colors.background, fg: colors.danger },
};

interface Props {
  order: Order;
  onAccept?: () => void;
  accepting?: boolean;
}

export function DeliveryCard({ order, onAccept, accepting }: Props) {
  const tone = STATUS[order.status];
  const cash = cashToCollect(order);
  const items = order.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Delivery from ${order.restaurant?.name ?? 'restaurant'} to ${order.deliveryAddress ?? 'customer'}`}
      onPress={() => router.push({ pathname: '/delivery/[id]', params: { id: order.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.top}>
        {tone && (
          <View style={[styles.pill, { backgroundColor: tone.bg }]}>
            <Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text>
          </View>
        )}
        <Text style={[styles.money, cash ? styles.cash : null]}>
          {cash ? `Collect ${formatINR(cash)}` : 'Paid online'}
        </Text>
      </View>

      <View style={styles.leg}>
        <Text style={styles.legLabel}>PICK UP</Text>
        <Text style={font.heading} numberOfLines={1}>
          {order.restaurant?.name ?? 'Restaurant'}
        </Text>
        <Text style={font.caption} numberOfLines={1}>
          {restaurantPlace(order) || '—'}
        </Text>
      </View>
      <View style={styles.leg}>
        <Text style={styles.legLabel}>DROP</Text>
        <Text style={font.body} numberOfLines={2}>
          {order.deliveryAddress ?? '—'}
        </Text>
        <Text style={font.caption}>
          {order.deliverySlot
            ? `Deliver ${formatTime(order.deliverySlot.startTime)}–${formatTime(order.deliverySlot.endTime)}`
            : 'Deliver as soon as possible'}
          {` · ${items} ${items === 1 ? 'item' : 'items'}`}
        </Text>
      </View>

      {onAccept && (
        <Button title="Accept delivery" onPress={onAccept} loading={accepting} style={styles.accept} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '700' },
  money: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  cash: { color: colors.text },
  leg: { gap: 2 },
  legLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 },
  accept: { marginTop: spacing.xs },
});
