import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  colors,
  customerName,
  font,
  formatDateTime,
  formatINR,
  radius,
  shortId,
  spacing,
  StatusPill,
  type Order,
} from '@mealdirect/shared';

export function AdminOrderRow({ order }: { order: Order }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.top}>
        <Text style={[font.heading, styles.flex]} numberOfLines={1}>
          {order.restaurant?.name ?? 'Restaurant'}
        </Text>
        <Text style={font.heading}>{formatINR(order.total)}</Text>
      </View>
      <Text style={font.caption} numberOfLines={1}>
        {customerName(order)} · {order.deliveryType === 'delivery' ? 'Delivery' : 'Pickup'} ·{' '}
        {order.paymentMethod === 'cod' ? 'Cash' : order.paymentStatus === 'completed' ? 'Paid online' : 'Unpaid online'}
      </Text>
      <View style={styles.bottom}>
        <StatusPill status={order.status} />
        <Text style={[font.caption, styles.right]}>
          {shortId(order.id)} · {formatDateTime(order.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, gap: spacing.xs },
  top: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  right: { marginLeft: 'auto' },
});
