import { useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  Banner,
  Button,
  Card,
  colors,
  errorMessage,
  ErrorState,
  font,
  formatDateTime,
  formatINR,
  isPayoutComplete,
  maskAccount,
  LoadingState,
  SheetForm,
  spacing,
  StatTile,
  TextField,
  type AdminRestaurantDetail,
} from '@mealdirect/shared';
import { ReviewPill } from '@/components/ReviewPill';
import { useGetRestaurantQuery, useReviewRestaurantMutation } from '@/store/serverApi';

type Decision = 'approve' | 'reject';

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, isLoading, isFetching, refetch } = useGetRestaurantQuery(id);

  if (isLoading) return <LoadingState />;
  if (!data) return <ErrorState message={errorMessage(error, 'Restaurant not found')} onRetry={refetch} />;
  return <Details detail={data} refreshing={isFetching} onRefresh={refetch} />;
}

function Details({
  detail: { restaurant, stats },
  refreshing,
  onRefresh,
}: {
  detail: AdminRestaurantDetail;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [notes, setNotes] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [review, { isLoading }] = useReviewRestaurantMutation();

  const owner = restaurant.owner;
  const ownerName = [owner?.firstName, owner?.lastName].filter(Boolean).join(' ') || 'Owner';
  const status = restaurant.verificationStatus;
  const payoutReady = isPayoutComplete(restaurant);

  const open = (d: Decision) => {
    setNotes('');
    setSheetError(null);
    setDecision(d);
  };

  const submit = async () => {
    if (decision === 'reject' && !notes.trim()) {
      setSheetError('Tell the owner what to fix. They see this note.');
      return;
    }
    setSheetError(null);
    try {
      await review({ id: restaurant.id, decision: decision!, notes: notes.trim() }).unwrap();
      setDone(decision === 'approve' ? `${restaurant.name} is live.` : `${restaurant.name} was rejected. The owner sees your note.`);
      setDecision(null);
    } catch (e) {
      setSheetError(errorMessage(e));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: restaurant.name }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <ReviewPill status={status} />
          <Text style={font.title}>{restaurant.name}</Text>
          <Text style={font.caption}>
            Added {formatDateTime(restaurant.createdAt)}
            {restaurant.approvedAt ? ` · approved ${formatDateTime(restaurant.approvedAt)}` : ''}
          </Text>
        </View>

        {done && <Banner tone="success" message={done} />}

        {status !== 'verified' && (
          <Card title={status === 'pending' ? 'Review' : 'Rejected'}>
            {status === 'rejected' && restaurant.verificationNotes ? (
              <Text style={[font.body, styles.gapBottom]}>Note sent to the owner: {restaurant.verificationNotes}</Text>
            ) : (
              <Text style={[font.caption, styles.gapBottom]}>
                Check the details below. Approving makes the restaurant visible to customers.
              </Text>
            )}
            {!payoutReady && (
              <Banner
                tone="warning"
                message="The owner hasn't added a UPI ID and bank account yet. They're needed before approval."
              />
            )}
            <Button title="Approve" onPress={() => open('approve')} disabled={!payoutReady} />
            {status === 'pending' && (
              <Button title="Reject" variant="danger" onPress={() => open('reject')} style={styles.gap} />
            )}
          </Card>
        )}

        <Card title="Restaurant">
          {restaurant.description ? <Text style={[font.body, styles.gapBottom]}>{restaurant.description}</Text> : null}
          <Detail label="Address" value={[restaurant.address, restaurant.city, restaurant.zipCode].filter(Boolean).join(', ')} />
          <Detail label="Business email" value={restaurant.email} />
          <Detail label="Phone" value={restaurant.phone} />
          <Detail
            label="Orders"
            value={[restaurant.deliveryEnabled && 'Delivery', restaurant.pickupEnabled && 'Pickup'].filter(Boolean).join(' & ') || 'Not set up'}
          />
        </Card>

        <Card title="Payout details">
          <Text style={[font.caption, styles.gapBottom]}>
            Customers paying by UPI at the door pay this UPI ID. Check the account belongs to the restaurant.
          </Text>
          <Detail label="UPI ID" value={restaurant.upiId} />
          <Detail label="Account holder" value={restaurant.bankAccountName} />
          <Detail
            label="Bank account"
            value={[maskAccount(restaurant.bankAccountNumber), restaurant.bankIFSC].filter(Boolean).join(' · ')}
          />
        </Card>

        <Card title="Owner">
          <Text style={font.body}>{ownerName}</Text>
          <Text style={font.caption}>{owner?.email}</Text>
          <View style={styles.actions}>
            {owner?.email ? (
              <Button title="Email" variant="secondary" onPress={() => Linking.openURL(`mailto:${owner.email}`)} style={styles.flex} />
            ) : null}
            {owner?.phone || restaurant.phone ? (
              <Button
                title="Call"
                variant="secondary"
                onPress={() => Linking.openURL(`tel:${owner?.phone || restaurant.phone}`)}
                style={styles.flex}
              />
            ) : null}
          </View>
        </Card>

        {status === 'verified' && (
          <>
            <Text style={[font.heading, styles.section]}>Last 30 days</Text>
            <View style={styles.tiles}>
              <StatTile label="Sales" value={formatINR(stats.last30Days.revenue)} />
              <StatTile
                label="Orders"
                value={String(stats.last30Days.orders - stats.last30Days.cancelled)}
                detail={stats.last30Days.cancelled ? `${stats.last30Days.cancelled} cancelled` : undefined}
              />
            </View>
            <Text style={[font.caption, styles.section]}>
              All time: {stats.orders - stats.cancelled} orders, {formatINR(stats.revenue)} in sales.
              {stats.lastOrderAt ? ` Last order ${formatDateTime(stats.lastOrderAt)}.` : ' No orders yet.'}
            </Text>
          </>
        )}
      </ScrollView>

      <SheetForm
        visible={decision !== null}
        title={decision === 'approve' ? `Approve ${restaurant.name}?` : `Reject ${restaurant.name}?`}
        onClose={() => setDecision(null)}
        onSubmit={submit}
        submitTitle={decision === 'approve' ? 'Approve' : 'Reject'}
        submitting={isLoading}
        error={sheetError}
      >
        <TextField
          label={decision === 'approve' ? 'Note (optional)' : 'What should the owner fix?'}
          value={notes}
          onChangeText={setNotes}
          placeholder={decision === 'reject' ? 'Upload your FSSAI licence and resubmit' : undefined}
          multiline
        />
      </SheetForm>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.detail}>
      <Text style={font.caption}>{label}</Text>
      <Text style={font.body}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { gap: spacing.xs, marginBottom: spacing.lg },
  gap: { marginTop: spacing.md },
  gapBottom: { marginBottom: spacing.md },
  detail: { marginBottom: spacing.md, gap: 2 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  flex: { flex: 1 },
  section: { marginBottom: spacing.md },
  tiles: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
});
