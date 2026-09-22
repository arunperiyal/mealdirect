import { useEffect } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import {
  colors,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  formatDateTime,
  formatINR,
  isActive,
  LoadingState,
  needsPayment,
  radius,
  spacing,
  STATUS_LABELS,
  type Order,
} from '@mealdirect/shared';
import { useGetMyOrdersQuery, useGetRestaurantQuery } from '@/store/serverApi';

export default function OrdersScreen() {
  const focused = useIsFocused();
  const { data, error, isLoading, isFetching, refetch } = useGetMyOrdersQuery();

  // Statuses change on the restaurant side, so refresh whenever the tab is shown
  useEffect(() => {
    if (focused && !isLoading) refetch();
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <LoadingState />;
  if (error && !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(o) => o.id}
      renderItem={({ item }) => <OrderRow order={item} />}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />
      }
      ListEmptyComponent={
        <EmptyState
          title="No orders yet"
          message="Your orders will show up here."
          actionTitle="Find something to eat"
          onAction={() => router.navigate('/')}
        />
      }
    />
  );
}

function OrderRow({ order }: { order: Order }) {
  const { data: restaurant } = useGetRestaurantQuery(order.restaurantId);
  const summary = order.items.map((i) => `${i.quantity} × ${i.name}`).join(', ');
  const active = isActive(order);
  const unpaid = needsPayment(order);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.top}>
        <Text style={[font.heading, styles.name]} numberOfLines={1}>
          {restaurant?.name ?? 'Restaurant'}
        </Text>
        <Text style={font.heading}>{formatINR(order.total)}</Text>
      </View>
      <Text style={font.caption} numberOfLines={1}>
        {summary}
      </Text>
      <View style={styles.bottom}>
        <View style={[styles.pill, active ? styles.pillActive : order.status === 'cancelled' ? styles.pillCancelled : styles.pillDone]}>
          <Text
            style={[
              styles.pillText,
              { color: active ? colors.brand : order.status === 'cancelled' ? colors.textMuted : colors.success },
            ]}
          >
            {STATUS_LABELS[order.status]}
          </Text>
        </View>
        {unpaid && (
          <View style={[styles.pill, styles.pillWarning]}>
            <Text style={[styles.pillText, { color: colors.warning }]}>Payment pending</Text>
          </View>
        )}
        <Text style={[font.caption, styles.date]}>{formatDateTime(order.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  row: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, gap: spacing.xs },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  name: { flex: 1 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap' },
  pill: { borderRadius: 12, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillActive: { backgroundColor: colors.brandSoft },
  pillDone: { backgroundColor: colors.successSoft },
  pillCancelled: { backgroundColor: colors.background },
  pillWarning: { backgroundColor: colors.warningSoft },
  pillText: { fontSize: 12, fontWeight: '600' },
  date: { marginLeft: 'auto' },
});
