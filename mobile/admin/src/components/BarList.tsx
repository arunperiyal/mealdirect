import { StyleSheet, Text, View } from 'react-native';
import { colors, font, spacing } from '@mealdirect/shared';
import { chart } from './chartTheme';

interface Row {
  id: string;
  label: string;
  value: number;
  detail?: string;
}

// Horizontal bars for ranking: one color (the rows are the same measure),
// value at the bar's tip, the name above it
export function BarList({ rows, format }: { rows: Row[]; format: (n: number) => string }) {
  const max = Math.max(0, ...rows.map((r) => r.value)) || 1;
  return (
    <View accessibilityRole="list">
      {rows.map((r) => (
        <View key={r.id} style={styles.row} accessibilityLabel={`${r.label}: ${format(r.value)}${r.detail ? `, ${r.detail}` : ''}`}>
          <View style={styles.labelRow}>
            <Text style={[font.body, styles.label]} numberOfLines={1}>
              {r.label}
            </Text>
            {r.detail ? <Text style={font.caption}>{r.detail}</Text> : null}
          </View>
          <View style={styles.barRow}>
            <View style={[styles.bar, { flex: r.value / max }]} />
            <View style={{ flex: 1 - r.value / max }} />
            <Text style={styles.value}>{format(r.value)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: spacing.md },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 4 },
  label: { flex: 1 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bar: {
    height: 14,
    minWidth: 2,
    backgroundColor: chart.series,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  value: { minWidth: 64, textAlign: 'right', color: colors.text, fontVariant: ['tabular-nums'], fontSize: 13 },
});
