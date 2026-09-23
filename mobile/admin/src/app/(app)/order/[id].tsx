import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  Banner,
  Button,
  Card,
  colors,
  customerName,
  errorMessage,
  ErrorState,
  font,
  formatDateTime,
  formatINR,
  formatTime,
  isActive,
  LoadingState,
  paymentLabel,
  PriceSummary,
  riderName,
  SheetForm,
  shortId,
  spacing,
  StatusPill,
  StatusTimeline,
  TextField,
  type Order,
  Chip,
} from '@mealdirect/shared';
import { useCancelOrderMutation, useGetOrderQuery, useResolvePaymentMutation } from '@/store/serverApi';

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, error, isLoading, isFetching, refetch } = useGetOrderQuery(id);

  if (isLoading) return <LoadingState />;
  if (!order) return <ErrorState message={errorMessage(error, 'Order not found')} onRetry={refetch} />;
  return <OrderDetails order={order} refreshing={isFetching} onRefresh={refetch} />;
}

function OrderDetails({ order, refreshing, onRefresh }: { order: Order; refreshing: boolean; onRefresh: () => void }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelOrder, { isLoading }] = useCancelOrderMutation();
  const [resolvePayment, { isLoading: resolving }] = useResolvePaymentMutation();
  const [resolveOpen, setResolveOpen] = useState<'collected' | 'written_off' | null>(null);
  const [method, setMethod] = useState<'cash' | 'upi'>('cash');
  const [resolveNote, setResolveNote] = useState('');
  const [resolveError, setResolveError] = useState<string | null>(null);
  const canResolve =
    order.paymentMethod === 'cod' &&
    ['not_paid', 'awaiting'].includes(order.collectionStatus ?? '') &&
    ['delivered', 'picked_up'].includes(order.status);

  const submitResolve = async () => {
    if (!resolveNote.trim()) {
      setResolveError('Add a note explaining the resolution');
      return;
    }
    setResolveError(null);
    try {
      await resolvePayment({
        id: order.id,
        outcome: resolveOpen!,
        ...(resolveOpen === 'collected' ? { method } : {}),
        note: resolveNote.trim(),
      }).unwrap();
      setResolveOpen(null);
    } catch (e) {
      setResolveError(errorMessage(e));
    }
  };
  const paidOnline = order.paymentMethod !== 'cod' && order.paymentStatus === 'completed';

  const submitCancel = async () => {
    if (!reason.trim()) {
      setCancelError('Give a reason. The customer and the restaurant see it.');
      return;
    }
    setCancelError(null);
    try {
      await cancelOrder({ id: order.id, reason: reason.trim() }).unwrap();
      setCancelOpen(false);
    } catch (e) {
      setCancelError(errorMessage(e));
    }
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <StatusPill status={order.status} />
          <Text style={font.title}>{shortId(order.id)}</Text>
          <Text style={font.caption}>Placed {formatDateTime(order.createdAt)}</Text>
        </View>

        <Card title="People">
          <Detail label="Customer" value={[customerName(order), order.customer?.phone].filter(Boolean).join(' · ')} />
          <Detail
            label={order.deliveryType === 'delivery' ? 'Delivery to' : 'Pickup'}
            value={
              order.deliveryType === 'delivery'
                ? `${order.deliveryAddress ?? '—'}${order.deliverySlot ? `\n${formatTime(order.deliverySlot.startTime)}–${formatTime(order.deliverySlot.endTime)}` : ''}`
                : 'Customer collects'
            }
          />
          {order.deliveryType === 'delivery' ? (
            <Detail
              label="Delivery partner"
              value={order.rider ? [riderName(order), order.rider.phone].filter(Boolean).join(' · ') : 'Not claimed yet'}
            />
          ) : null}
          {order.customerNotes ? <Detail label="Customer note" value={order.customerNotes} /> : null}
          {order.cancellationReason ? <Detail label="Cancellation reason" value={order.cancellationReason} /> : null}
        </Card>

        {order.paymentMethod === 'cod' && (
          <Card title="Payment">
            {order.collectionStatus === 'not_paid' && (
              <Banner tone="error" message="Reported as not paid. The customer can't order until this is resolved." />
            )}
            <Text style={font.body}>{paymentLabel(order)}</Text>
            {order.collectionStatus && order.collectionStatus !== 'awaiting' && order.collectedAt ? (
              <Text style={font.caption}>
                Recorded {formatDateTime(order.collectedAt)}
                {order.collectedById && order.collectedById === order.riderId ? ` by ${riderName(order)}` : ''}
              </Text>
            ) : null}
            {order.collectionNote ? <Text style={[font.caption, styles.gap]}>{order.collectionNote}</Text> : null}
            {canResolve && (
              <View style={styles.resolveRow}>
                <Button
                  title="Mark paid"
                  onPress={() => {
                    setResolveNote('');
                    setResolveError(null);
                    setResolveOpen('collected');
                  }}
                  style={styles.flex}
                />
                <Button
                  title="Write off"
                  variant="danger"
                  onPress={() => {
                    setResolveNote('');
                    setResolveError(null);
                    setResolveOpen('written_off');
                  }}
                  style={styles.flex}
                />
              </View>
            )}
          </Card>
        )}

        <Card title="Items">
          {order.items.map((item) => (
            <View key={item.menuItemId} style={styles.itemRow}>
              <Text style={[font.body, styles.flex]}>
                {item.quantity} × {item.name}
              </Text>
              <Text style={font.body}>{formatINR(item.total)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <PriceSummary subtotal={order.subtotal} tax={order.tax} deliveryFee={order.deliveryFee} total={order.total} />
          {order.paymentMethod !== 'cod' && <Text style={[font.caption, styles.gap]}>{paymentLabel(order)}</Text>}
        </Card>

        <Card title="Progress">
          <StatusTimeline order={order} />
        </Card>

        {isActive(order) && <Button title="Cancel order" variant="danger" onPress={() => setCancelOpen(true)} />}
      </ScrollView>

      <SheetForm
        visible={resolveOpen !== null}
        title={resolveOpen === 'collected' ? 'Mark as paid' : 'Write off this order'}
        onClose={() => setResolveOpen(null)}
        onSubmit={submitResolve}
        submitTitle={resolveOpen === 'collected' ? 'Mark paid' : 'Write off'}
        submitting={resolving}
        error={resolveError}
      >
        {resolveOpen === 'collected' ? (
          <View style={styles.methodRow} accessibilityRole="radiogroup">
            <Chip label="Cash" selected={method === 'cash'} onPress={() => setMethod('cash')} />
            <Chip label="UPI" selected={method === 'upi'} onPress={() => setMethod('upi')} />
          </View>
        ) : (
          <Text style={[font.caption, styles.gapBottom]}>
            The order stays unpaid, but the customer can order again.
          </Text>
        )}
        <TextField
          label="Note"
          value={resolveNote}
          onChangeText={setResolveNote}
          placeholder={resolveOpen === 'collected' ? 'Customer paid MealDirect UPI next morning' : 'Goodwill after a late delivery'}
          multiline
        />
      </SheetForm>

      <SheetForm
        visible={cancelOpen}
        title="Cancel this order?"
        onClose={() => setCancelOpen(false)}
        onSubmit={submitCancel}
        submitTitle="Cancel order"
        submitting={isLoading}
        error={cancelError}
      >
        {paidOnline && <Banner tone="warning" message="Paid online: arrange the refund after cancelling." />}
        <TextField label="Reason" value={reason} onChangeText={setReason} multiline />
      </SheetForm>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={font.caption}>{label}</Text>
      <Text style={font.body}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { gap: spacing.xs, marginBottom: spacing.lg },
  gap: { marginTop: spacing.sm },
  flex: { flex: 1 },
  detail: { marginBottom: spacing.md, gap: 2 },
  itemRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
  resolveRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  methodRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  gapBottom: { marginBottom: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md },
});
