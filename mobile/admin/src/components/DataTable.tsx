import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@mealdirect/shared';

// Plain table view of chart data, so no value depends on tapping a mark
export function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <View accessibilityRole="list">
      <View style={[styles.row, styles.header]}>
        {headers.map((h, i) => (
          <Text key={h} style={[styles.cell, styles.headText, i > 0 && styles.num]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r) => (
        <View key={String(r[0])} style={styles.row}>
          {r.map((c, i) => (
            <Text key={i} style={[styles.cell, i > 0 && styles.num]}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  header: { borderBottomColor: colors.textMuted },
  cell: { flex: 1, fontSize: 14, color: colors.text },
  headText: { fontWeight: '600', color: colors.textMuted },
  num: { textAlign: 'right', fontVariant: ['tabular-nums'] },
});
