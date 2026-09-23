import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
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
  StatTile,
} from '@mealdirect/shared';
import { DeliveryCard } from '@/components/DeliveryCard';
import { ORDER_POLL_MS } from '@/config';
import { deliveredToday, isActiveDelivery } from '@/lib/riderSteps';
import { useGetBalanceQuery, useGetMyDeliveriesQuery } from '@/store/serverApi';

export default function DeliveriesScreen() {
  const focused = useIsFocused();
  const { data, error, isLoading, isFetching, refetch } = useGetMyDeliveriesQuery(undefined, {
    pollingInterval: focused ? ORDER_POLL_MS : 0,
  });
  const balance = useGetBalanceQuery(undefined, { pollingInterval: focused ? ORDER_POLL_MS : 0 });
  const cash = balance.data;

  if (isLoading) return <LoadingState />;
  if (error && !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const orders = data ?? [];
  const active = orders.filter(isActiveDelivery);
  const past = orders.filter((o) => !isActiveDelivery(o));
  const delivered = deliveredToday(orders);
  const sections = [
    { title: 'In progress', data: active },
    ...(past.length ? [{ title: 'Recent', data: past }] : []),
  ];

  return (
    <SectionList
      sections={sections}
      keyExtractor={(o) => o.id}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={() => {
            refetch();
            balance.refetch();
          }}
          tintColor={colors.brand}
        />
      }
      ListHeaderComponent={
        <>
          {cash && cash.overdue > 0 && (
            <Banner
              tone="error"
              message={`Hand ${formatINR(cash.overdue)} of cash to MealDirect. You can't accept new deliveries until it's settled.`}
            />
          )}
          <View style={styles.tiles}>
            <StatTile
              label="Cash to settle"
              value={formatINR(cash?.balance ?? 0)}
              highlight={(cash?.overdue ?? 0) > 0}
              detail={cash && cash.balance > 0 ? 'Hand over to MealDirect by tomorrow' : 'All settled'}
            />
            <StatTile
              label="Delivered today"
              value={String(delivered)}
              detail={cash ? `${formatINR(cash.cashToday)} cash · ${formatINR(cash.upiToday)} UPI` : undefined}
            />
          </View>
        </>
      }
      renderSectionHeader={({ section }) => <Text style={[font.heading, styles.section]}>{section.title}</Text>}
      renderSectionFooter={({ section }) =>
        section.title === 'In progress' && section.data.length === 0 ? (
          <EmptyState title="Nothing in progress" message="Accept a delivery from the Available tab." />
        ) : null
      }
      renderItem={({ item }) => <DeliveryCard order={item} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  tiles: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  section: { marginTop: spacing.md, marginBottom: spacing.sm },
});
