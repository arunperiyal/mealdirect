import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Chip, colors, EmptyState, errorMessage, ErrorState, LoadingState, spacing, type Order } from '@mealdirect/shared';
import { OrderRow } from '@/components/OrderRow';
import { ORDER_POLL_MS } from '@/config';
import { ACTIVE_STATUSES, COMPLETED_STATUSES, needsAttention } from '@/lib/orderActions';
import { useRestaurant } from '@/lib/useRestaurant';
import { useGetRestaurantOrdersQuery } from '@/store/serverApi';

const FILTERS = [
  { key: 'active', label: 'Active', match: (o: Order) => (ACTIVE_STATUSES as readonly string[]).includes(o.status) },
  { key: 'completed', label: 'Completed', match: (o: Order) => (COMPLETED_STATUSES as readonly string[]).includes(o.status) },
  { key: 'cancelled', label: 'Cancelled', match: (o: Order) => o.status === 'cancelled' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

// New orders first, then oldest first so nothing waits too long
const byUrgency = (a: Order, b: Order) =>
  Number(needsAttention(b)) - Number(needsAttention(a)) ||
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

export default function OrdersScreen() {
  const restaurant = useRestaurant();
  const focused = useIsFocused();
  const [filter, setFilter] = useState<FilterKey>('active');
  const { data, error, isLoading, isFetching, refetch } = useGetRestaurantOrdersQuery(
    { restaurantId: restaurant.id },
    { pollingInterval: focused ? ORDER_POLL_MS : 0 }
  );

  if (isLoading) return <LoadingState />;
  if (error && !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const all = data ?? [];
  const current = FILTERS.find((f) => f.key === filter)!;
  const shown = all.filter(current.match);
  const sorted = filter === 'active' ? [...shown].sort(byUrgency) : shown;

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
        data={sorted}
        keyExtractor={(o) => o.id}
        renderItem={({ item }) => <OrderRow order={item} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />
        }
        ListEmptyComponent={
          <EmptyState
            title={filter === 'active' ? 'No active orders' : `No ${current.label.toLowerCase()} orders`}
            message={filter === 'active' ? 'New orders show up here automatically.' : undefined}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 },
  list: { padding: spacing.lg, flexGrow: 1 },
});
