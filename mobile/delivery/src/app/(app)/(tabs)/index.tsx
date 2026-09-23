import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import {
  Banner,
  colors,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  formatINR,
  LoadingState,
  spacing,
} from '@mealdirect/shared';
import { DeliveryCard } from '@/components/DeliveryCard';
import { ORDER_POLL_MS } from '@/config';
import { isActiveDelivery } from '@/lib/riderSteps';
import { useActMutation, useGetAvailableQuery, useGetBalanceQuery, useGetMyDeliveriesQuery } from '@/store/serverApi';

// Must match MAX_ACTIVE in backend/src/controllers/deliveryController.js
const MAX_ACTIVE = 3;

export default function AvailableScreen() {
  const focused = useIsFocused();
  const { data, error, isLoading, isFetching, refetch } = useGetAvailableQuery(undefined, {
    pollingInterval: focused ? ORDER_POLL_MS : 0,
  });
  const { data: mine = [] } = useGetMyDeliveriesQuery();
  const { data: cash } = useGetBalanceQuery(undefined, { pollingInterval: focused ? ORDER_POLL_MS : 0 });
  const overdue = cash?.overdue ?? 0;
  const [act] = useActMutation();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const active = mine.filter(isActiveDelivery).length;
  const full = active >= MAX_ACTIVE;
  const canAccept = !full && overdue === 0;

  const accept = async (id: string) => {
    setMessage(null);
    setAccepting(id);
    try {
      await act({ id, action: 'claim' }).unwrap();
      router.push({ pathname: '/delivery/[id]', params: { id } });
    } catch (e) {
      // Someone else was faster: the list refreshes and the order drops out
      setMessage(errorMessage(e));
      refetch();
    } finally {
      setAccepting(null);
    }
  };

  if (isLoading) return <LoadingState />;
  if (error && !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <View style={styles.flex}>
      <FlatList
        data={data ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />
        }
        ListHeaderComponent={
          <>
            {message && <Banner tone="warning" message={message} />}
            {overdue > 0 && (
              <Banner
                tone="error"
                message={`Settle ${formatINR(overdue)} of cash with MealDirect to accept new deliveries.`}
              />
            )}
            {full && (
              <Banner
                tone="warning"
                message={`You have ${active} active deliveries, the most at once. Finish one to accept more.`}
              />
            )}
            {(data?.length ?? 0) > 0 && (
              <Text style={[font.caption, styles.hint]}>Ready orders first. The first partner to accept gets it.</Text>
            )}
          </>
        }
        renderItem={({ item }) => (
          <DeliveryCard
            order={item}
            onAccept={canAccept ? () => accept(item.id) : undefined}
            accepting={accepting === item.id}
          />
        )}
        ListEmptyComponent={
          <EmptyState title="No deliveries right now" message="New orders show up here as restaurants accept them." />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, flexGrow: 1 },
  hint: { marginBottom: spacing.md },
});
