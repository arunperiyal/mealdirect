import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import {
  addDays,
  Banner,
  Button,
  Card,
  Chip,
  colors,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  LoadingState,
  localDateString,
  spacing,
  type DishTotal,
  type KitchenGroup,
} from '@mealdirect/shared';
import { OrderRow } from '@/components/OrderRow';
import { ORDER_POLL_MS } from '@/config';
import { bulkResultMessage, countsSummary, groupTitle, kitchenCounts } from '@/lib/kitchen';
import { dayLabel } from '@/lib/time';
import { useRestaurant } from '@/lib/useRestaurant';
import { useBulkAdvanceMutation, useGetKitchenQuery } from '@/store/serverApi';

const DAY_OFFSETS = [0, 1];

export default function KitchenScreen() {
  const restaurant = useRestaurant();
  const focused = useIsFocused();
  const [offset, setOffset] = useState(0);
  const date = useMemo(() => localDateString(addDays(new Date(), offset)), [offset]);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const { data, error, isLoading, isFetching, refetch } = useGetKitchenQuery(
    { restaurantId: restaurant.id, date },
    { pollingInterval: focused ? ORDER_POLL_MS : 0 }
  );

  const days = (
    <View style={styles.days} accessibilityRole="radiogroup">
      {DAY_OFFSETS.map((o) => {
        const label = dayLabel(localDateString(addDays(new Date(), o)));
        return (
          <Chip
            key={o}
            label={label}
            selected={o === offset}
            onPress={() => {
              setNotice(null);
              setOffset(o);
            }}
          />
        );
      })}
    </View>
  );

  let body;
  if (isLoading) body = <LoadingState />;
  else if (error && !data) body = <ErrorState message={errorMessage(error)} onRetry={refetch} />;
  else if (!data?.menus.length)
    body = <EmptyState title={`No menu for ${dayLabel(date).toLowerCase()}`} message="Add one in the Menus tab." />;
  else if (!data.groups.length)
    body = <EmptyState title="No orders yet" message="Orders for this day show up here, grouped by delivery time." />;
  else {
    body = (
      <>
        <Card title="To cook">
          <DishList dishes={data.totals} />
          <Text style={[font.caption, styles.summary]}>{countsSummary(kitchenCounts(data.counts))}</Text>
        </Card>
        {data.groups.map((g) => (
          <GroupCard key={`${g.menuId}-${g.key}`} group={g} onResult={setNotice} />
        ))}
      </>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />
      }
    >
      {days}
      {notice && <Banner tone={notice.tone} message={notice.message} />}
      {body}
    </ScrollView>
  );
}

function DishList({ dishes }: { dishes: DishTotal[] }) {
  return (
    <View style={styles.dishes}>
      {dishes.map((d) => (
        <View key={d.menuItemId} style={styles.dish}>
          <Text style={[font.body, styles.flex]}>{d.name}</Text>
          <Text style={[font.heading, styles.qty]}>× {d.quantity}</Text>
        </View>
      ))}
    </View>
  );
}

function GroupCard({
  group,
  onResult,
}: {
  group: KitchenGroup;
  onResult: (n: { tone: 'success' | 'error'; message: string }) => void;
}) {
  const [bulk, { isLoading }] = useBulkAdvanceMutation();
  const [running, setRunning] = useState<'accept' | 'ready' | null>(null);
  const [showOrders, setShowOrders] = useState(false);
  const counts = kitchenCounts(group.counts);
  const title = groupTitle(group);

  const run = async (action: 'accept' | 'ready') => {
    setRunning(action);
    try {
      const result = await bulk({ menuId: group.menuId, group: group.key, action }).unwrap();
      onResult({ tone: 'success', message: bulkResultMessage(action, result, title) });
    } catch (e) {
      onResult({ tone: 'error', message: errorMessage(e) });
    } finally {
      setRunning(null);
    }
  };

  const confirmReady = () =>
    Alert.alert(`Mark ${counts.accepted} ready?`, `${title}: every accepted order becomes ready.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark ready', onPress: () => run('ready') },
    ]);

  return (
    <Card title={title}>
      <DishList dishes={group.dishTotals} />
      <View style={styles.actions}>
        {counts.new > 0 && (
          <Button
            title={`Accept all new (${counts.new})`}
            onPress={() => run('accept')}
            loading={isLoading && running === 'accept'}
            disabled={isLoading}
          />
        )}
        {counts.accepted > 0 && (
          <Button
            title={`Mark all ready (${counts.accepted})`}
            variant="secondary"
            onPress={confirmReady}
            loading={isLoading && running === 'ready'}
            disabled={isLoading}
          />
        )}
        {counts.new === 0 && counts.accepted === 0 && (
          <Text style={font.caption}>{countsSummary(counts)}</Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showOrders }}
        onPress={() => setShowOrders((v) => !v)}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>
          {showOrders ? 'Hide orders' : `Show ${group.orders.length} order${group.orders.length === 1 ? '' : 's'}`}
        </Text>
      </Pressable>
      {showOrders && group.orders.map((o) => <OrderRow key={o.id} order={o} />)}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, flexGrow: 1 },
  days: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  flex: { flex: 1 },
  summary: { marginTop: spacing.md },
  dishes: { gap: spacing.xs },
  dish: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  qty: { fontVariant: ['tabular-nums'] },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  toggle: { paddingVertical: spacing.sm, marginTop: spacing.sm },
  toggleText: { color: colors.brand, fontWeight: '600' },
});
