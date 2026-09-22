import { StyleSheet, Text, View } from 'react-native';
import { formatINR } from '../lib/money';
import { colors, spacing } from '../theme';

interface Props {
  subtotal: number | string;
  tax: number | string;
  deliveryFee: number | string;
  total: number | string;
  estimated?: boolean;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.value, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

export function PriceSummary({ subtotal, tax, deliveryFee, total, estimated }: Props) {
  return (
    <View>
      <Row label="Item total" value={formatINR(subtotal)} />
      <Row label="Taxes (5%)" value={formatINR(tax)} />
      {Number(deliveryFee) > 0 && <Row label="Delivery fee" value={formatINR(deliveryFee)} />}
      <View style={styles.divider} />
      <Row label={estimated ? 'Estimated total' : 'Total'} value={formatINR(total)} strong />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  label: { color: colors.textMuted, fontSize: 15 },
  value: { color: colors.text, fontSize: 15, fontVariant: ['tabular-nums'] },
  strong: { color: colors.text, fontWeight: '700', fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
});
