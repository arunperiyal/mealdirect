import { useState } from 'react';
import { Alert, FlatList, Linking, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  Banner,
  Button,
  Chip,
  colors,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  formatDateTime,
  LoadingState,
  radius,
  spacing,
  type AdminRider,
  type RiderStatus,
} from '@mealdirect/shared';
import { useGetRidersQuery, useSetRiderStatusMutation } from '@/store/serverApi';

const FILTERS: { status: RiderStatus; label: string }[] = [
  { status: 'pending', label: 'Waiting' },
  { status: 'approved', label: 'Approved' },
  { status: 'suspended', label: 'Suspended' },
];

export default function RidersScreen() {
  const [status, setStatus] = useState<RiderStatus>('pending');
  const { data, error, isLoading, isFetching, refetch } = useGetRidersQuery({ status });
  const [setRiderStatus] = useSetRiderStatusMutation();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const change = async (rider: AdminRider, action: 'approve' | 'suspend') => {
    setActionError(null);
    setBusy(rider.id);
    try {
      await setRiderStatus({ id: rider.id, action }).unwrap();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmSuspend = (rider: AdminRider) =>
    Alert.alert(`Suspend ${rider.firstName ?? 'this rider'}?`, 'They can’t accept or update deliveries until approved again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Suspend', style: 'destructive', onPress: () => change(rider, 'suspend') },
    ]);

  return (
    <View style={styles.flex}>
      <View style={styles.filters} accessibilityRole="radiogroup">
        {FILTERS.map((f) => (
          <Chip
            key={f.status}
            label={data ? `${f.label} (${data.counts[f.status]})` : f.label}
            selected={status === f.status}
            onPress={() => setStatus(f.status)}
          />
        ))}
      </View>
      {isLoading ? (
        <LoadingState />
      ) : error && !data ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : (
        <FlatList
          data={data?.riders ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />
          }
          ListHeaderComponent={actionError ? <Banner tone="error" message={actionError} /> : null}
          ListEmptyComponent={
            <EmptyState
              title={status === 'pending' ? 'Nobody waiting' : 'None yet'}
              message={status === 'pending' ? 'Delivery partners who sign up appear here for approval.' : undefined}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={font.heading}>{[item.firstName, item.lastName].filter(Boolean).join(' ') || item.email}</Text>
              <Text style={font.caption}>
                {item.phone ?? 'No phone'} · {item.email}
              </Text>
              <Text style={font.caption}>
                Signed up {formatDateTime(item.createdAt)} · {item.deliveries} {item.deliveries === 1 ? 'delivery' : 'deliveries'}
              </Text>
              <View style={styles.actions}>
                {item.phone ? (
                  <Button title="Call" variant="secondary" onPress={() => Linking.openURL(`tel:${item.phone}`)} style={styles.flex} />
                ) : null}
                {item.riderStatus === 'approved' ? (
                  <Button
                    title="Suspend"
                    variant="danger"
                    onPress={() => confirmSuspend(item)}
                    loading={busy === item.id}
                    style={styles.flex}
                  />
                ) : (
                  <Button title="Approve" onPress={() => change(item, 'approve')} loading={busy === item.id} style={styles.flex} />
                )}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 },
  list: { padding: spacing.lg, flexGrow: 1 },
  row: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, gap: 4 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
