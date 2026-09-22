import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, colors, font, spacing } from '@mealdirect/shared';
import { niceMax, type Bucket } from '@/lib/charts';
import { chart } from './chartTheme';

interface Props {
  title: string;
  buckets: Bucket[];
  value: (b: Bucket) => number;
  format: (n: number) => string;
  dimmed?: boolean; // refetching: keep the old render, faded
}

const PLOT_HEIGHT = 150;
const AXIS_WIDTH = 48;
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;

// Single-series column chart: one color, no legend (the title names the series)
export function ColumnChart({ title, buckets, value, format, dimmed }: Props) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const max = niceMax(Math.max(0, ...buckets.map(value)));
  const ticks = [max, max / 2, 0];
  const slot = buckets.length ? width / buckets.length : 0;
  const barWidth = Math.max(1, Math.min(MAX_BAR, slot - GAP));
  const current = selected !== null ? buckets[selected] : null;
  const xLabels = buckets.length > 2 ? [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1] : buckets.map((_, i) => i);

  return (
    <Card style={dimmed ? styles.dimmed : undefined}>
      <Text style={font.heading}>{title}</Text>
      <Text style={[font.caption, styles.readout]} accessibilityLiveRegion="polite">
        {current ? `${current.fullLabel}: ${format(value(current))}` : 'Tap a column to see its value'}
      </Text>

      <View style={styles.row}>
        <View style={[styles.yAxis, { height: PLOT_HEIGHT }]}>
          {ticks.map((t) => (
            <Text key={t} style={styles.axisText}>
              {format(t)}
            </Text>
          ))}
        </View>

        <View style={styles.flex}>
          <View
            style={[styles.plot, { height: PLOT_HEIGHT }]}
            onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
          >
            {ticks.map((t, i) => (
              <View key={t} style={[styles.gridline, { top: (i * PLOT_HEIGHT) / 2 }]} />
            ))}
            {width > 0 &&
              buckets.map((b, i) => {
                const v = value(b);
                const height = (v / max) * PLOT_HEIGHT;
                return (
                  <Pressable
                    key={b.date}
                    accessibilityRole="button"
                    accessibilityLabel={`${b.fullLabel}: ${format(v)}`}
                    onPress={() => setSelected(i === selected ? null : i)}
                    style={[styles.slot, { width: slot }]}
                  >
                    {height > 0 && (
                      <View
                        style={{
                          width: barWidth,
                          height,
                          backgroundColor: i === selected ? chart.seriesSelected : chart.series,
                          borderTopLeftRadius: Math.min(RADIUS, height),
                          borderTopRightRadius: Math.min(RADIUS, height),
                        }}
                      />
                    )}
                  </Pressable>
                );
              })}
          </View>
          <View style={styles.xAxis}>
            {xLabels.map((i) => (
              <Text
                key={i}
                style={[
                  styles.axisText,
                  styles.xLabel,
                  { left: Math.max(0, Math.min(width - 48, i * slot + slot / 2 - 24)) },
                ]}
              >
                {buckets[i]?.label}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  dimmed: { opacity: 0.5 },
  readout: { marginTop: 2, marginBottom: spacing.md, minHeight: 18 },
  row: { flexDirection: 'row' },
  flex: { flex: 1 },
  yAxis: { width: AXIS_WIDTH, justifyContent: 'space-between', paddingRight: spacing.sm, marginTop: -7, marginBottom: -7 },
  axisText: { fontSize: 11, color: chart.axisText, textAlign: 'right', fontVariant: ['tabular-nums'] },
  plot: { flexDirection: 'row', alignItems: 'flex-end' },
  gridline: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: chart.grid },
  slot: { height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  xAxis: { height: 22, marginTop: 4 },
  xLabel: { position: 'absolute', width: 48, textAlign: 'center', color: colors.textMuted },
});
