import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import {
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
import { isActiveDelivery, todaySummary } from '@/lib/riderSteps';
import { useGetMyDeliveriesQuery } from '@/store/serverApi';

export default function DeliveriesScreen() {
  const focused = useIsFocused();
  const { data, error, isLoading, isFetching, refetch } = useGetMyDeliveriesQuery(undefined, {
    pollingInterval: focused ? ORDER_POLL_MS : 0,
  });

  if (isLoading) return <LoadingState />;
  if (error && !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const orders = data ?? [];
  const active = orders.filter(isActiveDelivery);
  const past = orders.filter((o) => !isActiveDelivery(o));
  const today = todaySummary(orders);
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
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />}
      ListHeaderComponent={
        <View style={styles.tiles}>
          <StatTile label="Delivered today" value={String(today.delivered)} />
          <StatTile label="Cash collected today" value={formatINR(today.cash)} />
        </View>
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
