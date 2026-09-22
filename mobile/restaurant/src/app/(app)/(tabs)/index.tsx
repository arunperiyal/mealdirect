import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import {
  Button,
  Card,
  colors,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  formatINR,
  LoadingState,
  localDateString,
  spacing,
  StatTile,
} from '@mealdirect/shared';
import { OrderRow } from '@/components/OrderRow';
import { ORDER_POLL_MS } from '@/config';
import { needsAttention } from '@/lib/orderActions';
import { summarizeToday } from '@/lib/today';
import { useRestaurant } from '@/lib/useRestaurant';
import { useGetMenusQuery, useGetRestaurantOrdersQuery } from '@/store/serverApi';

export default function TodayScreen() {
  const restaurant = useRestaurant();
  const focused = useIsFocused();
  const today = localDateString(new Date());

  const orders = useGetRestaurantOrdersQuery(
    { restaurantId: restaurant.id },
    { pollingInterval: focused ? ORDER_POLL_MS : 0 }
  );
  const menus = useGetMenusQuery({ restaurantId: restaurant.id, from: today, to: today });

  if (orders.isLoading) return <LoadingState />;
  if (orders.error && !orders.data) {
    return <ErrorState message={errorMessage(orders.error)} onRetry={orders.refetch} />;
  }

  const list = orders.data ?? [];
  const summary = summarizeToday(list);
  const waiting = list.filter(needsAttention);
  const todaysMenu = menus.data?.[0];
  const soldOut = todaysMenu?.items.filter((i) => !i.available).length ?? 0;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={orders.isFetching && !orders.isLoading}
          onRefresh={() => {
            orders.refetch();
            menus.refetch();
          }}
          tintColor={colors.brand}
        />
      }
    >
      <View style={styles.tiles}>
        <StatTile
          label="New orders"
          value={String(summary.newOrders)}
          highlight={summary.newOrders > 0}
          onPress={() => router.navigate('/orders')}
        />
        <StatTile label="In progress" value={String(summary.inProgress)} onPress={() => router.navigate('/orders')} />
        <StatTile label="Completed today" value={String(summary.completed)} />
        <StatTile label="Sales today" value={formatINR(summary.revenue)} />
      </View>

      <Card title="Today's menu">
        {menus.isLoading ? (
          <Text style={font.caption}>Loading…</Text>
        ) : todaysMenu ? (
          <>
            <Text style={font.body}>
              {todaysMenu.status === 'published'
                ? 'Open for orders'
                : todaysMenu.status === 'draft'
                  ? 'Draft: customers can’t see it yet'
                  : 'Closed for orders'}
            </Text>
            <Text style={[font.caption, styles.gap]}>
              {todaysMenu.items.length} {todaysMenu.items.length === 1 ? 'dish' : 'dishes'}
              {soldOut > 0 ? ` · ${soldOut} sold out` : ''}
            </Text>
            <Button
              title="Manage today's menu"
              variant="secondary"
              onPress={() => router.push({ pathname: '/menu/[id]', params: { id: todaysMenu.id } })}
              style={styles.gap}
            />
          </>
        ) : (
          <>
            <Text style={font.body}>No menu for today yet. Customers can’t order until you publish one.</Text>
            <Button
              title="Create today's menu"
              onPress={() => router.push({ pathname: '/menu/new', params: { date: today } })}
              style={styles.gap}
            />
          </>
        )}
        {menus.error ? <Text style={[font.caption, { color: colors.danger }]}>{errorMessage(menus.error)}</Text> : null}
      </Card>

      <Text style={[font.heading, styles.section]}>Waiting for you</Text>
      {waiting.length === 0 ? (
        <EmptyState title="All caught up" message="New orders appear here as they come in." />
      ) : (
        waiting.map((o) => <OrderRow key={o.id} order={o} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  gap: { marginTop: spacing.sm },
  section: { marginTop: spacing.md, marginBottom: spacing.md },
});
