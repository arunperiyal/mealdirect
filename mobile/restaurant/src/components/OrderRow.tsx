import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, font, formatINR, formatTime, radius, spacing, StatusPill, type Order } from '@mealdirect/shared';
import { customerName, needsAttention, paymentLabel, shortId } from '@/lib/orderActions';

export function OrderRow({ order }: { order: Order }) {
  const placed = new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const summary = order.items.map((i) => `${i.quantity} × ${i.name}`).join(', ');
  const when =
    order.deliveryType === 'delivery'
      ? `${order.deliverySlot ? `Delivery ${formatTime(order.deliverySlot.startTime)}–${formatTime(order.deliverySlot.endTime)}` : 'Delivery'}${order.rider ? ` · ${order.rider.firstName ?? 'rider'}` : ''}`
      : 'Pickup';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Order ${shortId(order.id)} from ${customerName(order)}`}
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
      style={({ pressed }) => [styles.row, needsAttention(order) && styles.attention, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.top}>
        <Text style={[font.heading, styles.flex]} numberOfLines={1}>
          {customerName(order)}
        </Text>
        <Text style={font.heading}>{formatINR(order.total)}</Text>
      </View>
      <Text style={font.caption} numberOfLines={2}>
        {summary}
      </Text>
      <View style={styles.bottom}>
        <StatusPill status={order.status} />
        <Text style={font.caption}>{when}</Text>
        <Text style={[font.caption, styles.right]}>
          {shortId(order.id)} · {placed}
        </Text>
      </View>
      <Text style={[font.caption, order.paymentStatus === 'completed' && { color: colors.success }]}>
        {paymentLabel(order)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  attention: { borderColor: colors.warning },
  top: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginTop: 2 },
  right: { marginLeft: 'auto' },
});
