import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  Button,
  Card,
  Chip,
  colors,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  formatINR,
  LoadingState,
  spacing,
  StatTile,
} from '@mealdirect/shared';
import { BarList } from '@/components/BarList';
import { ColumnChart } from '@/components/ColumnChart';
import { DataTable } from '@/components/DataTable';
import { bucketForDisplay, compactCount, compactINR, localTzOffset } from '@/lib/charts';
import { useGetAnalyticsQuery, useGetChangeRequestsQuery } from '@/store/serverApi';

const RANGES = [7, 30, 90] as const;

export default function OverviewScreen() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [showTable, setShowTable] = useState(false);
  const tzOffset = useMemo(() => localTzOffset(), []);
  const { data, error, isLoading, isFetching, refetch } = useGetAnalyticsQuery({ days, tzOffset });
  const { data: changes = [], refetch: refetchChanges } = useGetChangeRequestsQuery();

  const display = useMemo(() => (data ? bucketForDisplay(data.byDay) : null), [data]);

  return (
    <View style={styles.flex}>
      {/* One filter row above everything it scopes */}
      <View style={styles.filters} accessibilityRole="radiogroup">
        {RANGES.map((d) => (
          <Chip key={d} label={`Last ${d} days`} selected={days === d} onPress={() => setDays(d)} />
        ))}
      </View>

      {isLoading ? (
        <LoadingState />
      ) : error && !data ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : data && display ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={() => {
                refetch();
                refetchChanges();
              }}
              tintColor={colors.brand}
            />
          }
        >
          {data.restaurants.pending > 0 && (
            <Card style={styles.review}>
              <Text style={font.heading}>
                {data.restaurants.pending} {data.restaurants.pending === 1 ? 'restaurant is' : 'restaurants are'} waiting
                for review
              </Text>
              <Button title="Review now" onPress={() => router.navigate('/restaurants')} style={styles.gap} />
            </Card>
          )}

          {changes.length > 0 && (
            <Card style={styles.review}>
              <Text style={font.heading}>
                {changes.length} {changes.length === 1 ? 'change' : 'changes'} to payout or personal details waiting
                for review
              </Text>
              <Button title="Review changes" onPress={() => router.push('/changes')} style={styles.gap} />
            </Card>
          )}

          {/* Previous numbers stay visible, faded, while a new range loads */}
          <View style={[styles.tiles, isFetching && styles.dimmed]}>
            <StatTile label="Sales" value={compactINR(data.totals.revenue)} detail="Excludes cancelled orders" />
            <StatTile
              label="Orders"
              value={compactCount(data.totals.orders - data.totals.cancelled)}
              detail={data.totals.cancelled ? `${data.totals.cancelled} cancelled` : 'None cancelled'}
            />
            <StatTile label="Average order" value={formatINR(data.totals.averageOrderValue)} />
            <StatTile
              label="Repeat customers"
              value={String(data.totals.repeatCustomers)}
              detail={`of ${data.totals.customers} who ordered`}
            />
          </View>

          <ColumnChart
            title={display.unit === 'day' ? 'Orders per day' : 'Orders per week'}
            buckets={display.buckets}
            value={(b) => b.orders}
            format={(n) => compactCount(Math.round(n))}
            dimmed={isFetching}
          />
          <ColumnChart
            title={display.unit === 'day' ? 'Sales per day' : 'Sales per week'}
            buckets={display.buckets}
            value={(b) => b.revenue}
            format={compactINR}
            dimmed={isFetching}
          />

          <Card title="Top restaurants by sales" style={isFetching ? styles.dimmed : undefined}>
            {data.topRestaurants.length === 0 ? (
              <EmptyState title="No sales in this period" />
            ) : (
              <BarList
                format={compactINR}
                rows={data.topRestaurants.map((r) => ({
                  id: r.id,
                  label: r.name,
                  value: r.revenue,
                  detail: `${r.orders} ${r.orders === 1 ? 'order' : 'orders'}`,
                }))}
              />
            )}
          </Card>

          <Card title="Platform">
            <Text style={font.body}>
              {data.restaurants.verified} live {data.restaurants.verified === 1 ? 'restaurant' : 'restaurants'} ·{' '}
              {data.restaurants.pending} pending · {data.restaurants.rejected} rejected
            </Text>
            <Text style={[font.body, styles.gap]}>
              {data.users.customers} customers · {data.users.partners} restaurant partners
            </Text>
          </Card>

          <Button
            title={showTable ? 'Hide table' : 'Show as table'}
            variant="secondary"
            onPress={() => setShowTable((v) => !v)}
          />
          {showTable && (
            <Card style={styles.gap}>
              <DataTable
                headers={[display.unit === 'day' ? 'Day' : 'Week', 'Orders', 'Sales']}
                rows={[...display.buckets].reverse().map((b) => [b.fullLabel, b.orders, formatINR(b.revenue)])}
              />
            </Card>
          )}
          <Text style={[font.caption, styles.note]}>
            Days follow this phone’s timezone. {data.range.from} to {data.range.to}.
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  content: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl * 2 },
  review: { borderWidth: 2, borderColor: colors.warning },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  dimmed: { opacity: 0.5 },
  gap: { marginTop: spacing.md },
  note: { textAlign: 'center', marginTop: spacing.lg },
});
