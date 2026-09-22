import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import {
  ACTIVE_STATUSES,
  Chip,
  colors,
  COMPLETED_STATUSES,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  LoadingState,
  spacing,
  type Order,
} from '@mealdirect/shared';
import { AdminOrderRow } from '@/components/AdminOrderRow';
import { ORDER_POLL_MS } from '@/config';
import { useGetOrdersQuery } from '@/store/serverApi';

const FILTERS = [
  { key: 'active', label: 'Active', match: (o: Order) => (ACTIVE_STATUSES as readonly string[]).includes(o.status) },
  { key: 'completed', label: 'Completed', match: (o: Order) => (COMPLETED_STATUSES as readonly string[]).includes(o.status) },
  { key: 'cancelled', label: 'Cancelled', match: (o: Order) => o.status === 'cancelled' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

export default function OrdersScreen() {
  const focused = useIsFocused();
  const [filter, setFilter] = useState<FilterKey>('active');
  const { data, error, isLoading, isFetching, refetch } = useGetOrdersQuery(undefined, {
    pollingInterval: focused ? ORDER_POLL_MS : 0,
  });

  if (isLoading) return <LoadingState />;
  if (error && !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const all = data ?? [];
  const current = FILTERS.find((f) => f.key === filter)!;

  return (
    <View style={styles.flex}>
      <View style={styles.filters} accessibilityRole="radiogroup">
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={`${f.label} (${all.filter(f.match).length})`}
            selected={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </View>
      <FlatList
        data={all.filter(current.match)}
        keyExtractor={(o) => o.id}
        renderItem={({ item }) => <AdminOrderRow order={item} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />
        }
        ListEmptyComponent={<EmptyState title={`No ${current.label.toLowerCase()} orders`} />}
        ListFooterComponent={
          all.length >= 100 ? <Text style={[font.caption, styles.note]}>Showing the latest 100 orders.</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 },
  list: { padding: spacing.lg, flexGrow: 1 },
  note: { textAlign: 'center', marginTop: spacing.sm },
});
