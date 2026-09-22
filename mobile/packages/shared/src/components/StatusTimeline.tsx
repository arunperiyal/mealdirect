import { StyleSheet, Text, View } from 'react-native';
import type { Order } from '../api/types';
import { formatDateTime } from '../lib/dates';
import { STATUS_LABELS, statusSteps } from '../lib/orderStatus';
import { colors, spacing } from '../theme';

export function StatusTimeline({ order }: { order: Order }) {
  if (order.status === 'cancelled') {
    return (
      <View>
        <Text style={styles.cancelled}>This order was cancelled</Text>
        {order.cancellationReason ? <Text style={styles.time}>{order.cancellationReason}</Text> : null}
      </View>
    );
  }

  const steps = statusSteps(order.deliveryType);
  const currentIndex = steps.indexOf(order.status);
  const reachedAt = new Map(order.statusHistory?.map((h) => [h.status, h.timestamp]));

  return (
    <View accessibilityRole="list">
      {steps.map((step, i) => {
        const done = i <= currentIndex;
        const current = i === currentIndex;
        const timestamp = reachedAt.get(step);
        return (
          <View
            key={step}
            style={styles.row}
            accessibilityLabel={`${STATUS_LABELS[step]}${current ? ', current status' : done ? ', done' : ''}`}
          >
            <View style={styles.rail}>
              <View style={[styles.dot, done && styles.dotDone, current && styles.dotCurrent]} />
              {i < steps.length - 1 && <View style={[styles.line, i < currentIndex && styles.lineDone]} />}
            </View>
            <View style={styles.label}>
              <Text style={[styles.step, done && styles.stepDone, current && styles.stepCurrent]}>
                {STATUS_LABELS[step]}
              </Text>
              {done && timestamp ? <Text style={styles.time}>{formatDateTime(timestamp)}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const DOT = 14;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', minHeight: 44 },
  rail: { width: DOT, alignItems: 'center', marginRight: spacing.md },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  dotDone: { borderColor: colors.success, backgroundColor: colors.success },
  dotCurrent: { borderColor: colors.brand, backgroundColor: colors.brand },
  line: { flex: 1, width: 2, backgroundColor: colors.border },
  lineDone: { backgroundColor: colors.success },
  label: { flex: 1, paddingBottom: spacing.md, marginTop: -2 },
  step: { color: colors.textMuted, fontSize: 15 },
  stepDone: { color: colors.text },
  stepCurrent: { fontWeight: '700', color: colors.brand },
  time: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  cancelled: { color: colors.danger, fontWeight: '700', fontSize: 16 },
});
