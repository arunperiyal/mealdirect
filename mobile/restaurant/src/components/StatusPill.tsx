import { StyleSheet, Text, View } from 'react-native';
import { colors, STATUS_LABELS, type OrderStatus } from '@mealdirect/shared';

const tones: Record<OrderStatus, { bg: string; fg: string }> = {
  pending: { bg: colors.warningSoft, fg: colors.warning },
  confirmed: { bg: colors.brandSoft, fg: colors.brand },
  preparing: { bg: colors.brandSoft, fg: colors.brand },
  ready: { bg: colors.successSoft, fg: colors.success },
  out_for_delivery: { bg: colors.successSoft, fg: colors.success },
  delivered: { bg: colors.background, fg: colors.textMuted },
  picked_up: { bg: colors.background, fg: colors.textMuted },
  cancelled: { bg: colors.background, fg: colors.danger },
};

// Restaurant-facing wording for the first status
const labels: Partial<Record<OrderStatus, string>> = { pending: 'New' };

export function StatusPill({ status }: { status: OrderStatus }) {
  const tone = tones[status];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{labels[status] ?? STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '700' },
});
