import { useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import {
  Banner,
  Button,
  Card,
  Chip,
  colors,
  errorMessage,
  ErrorState,
  font,
  formatDateTime,
  formatINR,
  formatTime,
  isActive,
  LoadingState,
  type Order,
  PriceSummary,
  SheetForm,
  spacing,
  StatusPill,
  StatusTimeline,
  TextField,
} from '@mealdirect/shared';
import { ORDER_POLL_MS } from '@/config';
import {
  canRecordPayment,
  canRestaurantCancel,
  customerName,
  nextStep,
  paymentLabel,
  riderName,
  shortId,
} from '@/lib/orderActions';
import { useAppSelector } from '@/store';
import {
  serverApi,
  useAdvanceOrderMutation,
  useCancelOrderMutation,
  useGetOrderQuery,
  useRecordPaymentMutation,
} from '@/store/serverApi';

const CANCEL_REASONS = ['Item sold out', 'Kitchen closed', "Can't deliver to this address", 'Customer requested'];

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const focused = useIsFocused();

  // Stop polling once the order can no longer change
  const selectCached = useMemo(() => serverApi.endpoints.getOrder.select(id), [id]);
  const cached = useAppSelector(selectCached).data;
  const poll = focused && (!cached || isActive(cached));

  const { data: order, error, isLoading, isFetching, refetch } = useGetOrderQuery(id, {
    pollingInterval: poll ? ORDER_POLL_MS : 0,
  });

  if (isLoading) return <LoadingState />;
  if (!order) return <ErrorState message={errorMessage(error, 'Order not found')} onRetry={refetch} />;

  return <OrderDetails order={order} refreshing={isFetching} onRefresh={refetch} />;
}

function OrderDetails({ order, refreshing, onRefresh }: { order: Order; refreshing: boolean; onRefresh: () => void }) {
  const [advanceOrder, { isLoading: advancing }] = useAdvanceOrderMutation();
  const [cancelOrder, { isLoading: cancelling }] = useCancelOrderMutation();
  const [recordPayment, { isLoading: recording }] = useRecordPaymentMutation();
  const [notPaidOpen, setNotPaidOpen] = useState(false);
  const [notPaidNote, setNotPaidNote] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const record = async (collection: 'cash' | 'upi' | 'not_paid', note?: string) => {
    setPaymentError(null);
    try {
      await recordPayment({ id: order.id, collection, note }).unwrap();
      setNotPaidOpen(false);
    } catch (e) {
      setPaymentError(errorMessage(e));
    }
  };
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  const step = nextStep(order);
  const paidOnline = order.paymentMethod !== 'cod' && order.paymentStatus === 'completed';
  const phone = order.customer?.phone;

  const runStep = async () => {
    if (step.kind !== 'action') return;
    setActionError(null);
    try {
      await advanceOrder({ id: order.id, action: step.action }).unwrap();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  const submitCancel = async () => {
    if (!reason.trim()) {
      setCancelError('Tell the customer why');
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
          <Text style={font.title}>{customerName(order)}</Text>
          <Text style={font.caption}>
            {shortId(order.id)} · placed {formatDateTime(order.createdAt)}
          </Text>
        </View>

        {actionError && <Banner tone="error" message={actionError} />}

        {step.kind === 'action' && (
          <Button title={step.label} onPress={runStep} loading={advancing} style={styles.primary} />
        )}
        {step.kind === 'waiting' && <Banner tone="warning" message={step.message} />}

        {order.customerNotes ? (
          <Card title="Note from the customer">
            <Text style={font.body}>{order.customerNotes}</Text>
          </Card>
        ) : null}

        {order.deliveryType === 'delivery' && isActive(order) && order.status !== 'pending' && (
          <Card title="Delivery partner">
            {order.rider ? (
              <>
                <Text style={font.body}>{riderName(order)}</Text>
                {order.rider.phone ? (
                  <Button
                    title={`Call ${order.rider.phone}`}
                    variant="secondary"
                    onPress={() => Linking.openURL(`tel:${order.rider!.phone}`)}
                    style={styles.gap}
                  />
                ) : null}
              </>
            ) : (
              <Text style={font.caption}>
                No delivery partner has accepted this order yet. One will pick it up when it’s ready, or you can
                deliver it yourself.
              </Text>
            )}
          </Card>
        )}

        <Card title={order.deliveryType === 'delivery' ? 'Delivery' : 'Pickup'}>
          {order.deliveryType === 'delivery' ? (
            <>
              <Text style={font.body}>{order.deliveryAddress ?? '—'}</Text>
              {order.deliverySlot && (
                <Text style={[font.caption, styles.gap]}>
                  Deliver between {formatTime(order.deliverySlot.startTime)} and {formatTime(order.deliverySlot.endTime)}
                </Text>
              )}
            </>
          ) : (
            <Text style={font.body}>The customer will collect this order.</Text>
          )}
          {phone ? (
            <Button
              title={`Call ${phone}`}
              variant="secondary"
              onPress={() => Linking.openURL(`tel:${phone}`)}
              style={styles.gap}
            />
          ) : (
            <Text style={[font.caption, styles.gap]}>No phone number on this account.</Text>
          )}
        </Card>

        <Card title="Items">
          {order.items.map((item) => (
            <View key={item.menuItemId} style={styles.itemRow}>
              <Text style={[font.body, styles.itemName]}>
                <Text style={styles.qty}>{item.quantity} × </Text>
                {item.name}
              </Text>
              <Text style={font.body}>{formatINR(item.total)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <PriceSummary subtotal={order.subtotal} tax={order.tax} deliveryFee={order.deliveryFee} total={order.total} />
          {/* Cash orders show payment in their own card once there's something to record or report */}
          {!canRecordPayment(order) && !(order.paymentMethod === 'cod' && order.riderId && order.collectionStatus !== 'awaiting') && (
            <Text style={[font.caption, styles.gap, paidOnline && { color: colors.success }]}>{paymentLabel(order)}</Text>
          )}
        </Card>

        {canRecordPayment(order) && (
          <Card title={`Collect ${formatINR(order.total)}`}>
            <Text style={font.caption}>How did the customer pay?</Text>
            {paymentError && <Banner tone="error" message={paymentError} />}
            <View style={styles.payButtons}>
              <Button title="Received cash" onPress={() => record('cash')} loading={recording} style={styles.flex} />
              <Button
                title="Received UPI"
                variant="secondary"
                onPress={() => record('upi')}
                disabled={recording}
                style={styles.flex}
              />
            </View>
            <Button
              title="Not paid"
              variant="danger"
              onPress={() => setNotPaidOpen(true)}
              disabled={recording}
              style={styles.gap}
            />
          </Card>
        )}
        {order.paymentMethod === 'cod' && order.riderId && order.collectionStatus !== 'awaiting' && (
          <Card title="Payment">
            <Text style={font.body}>
              {paymentLabel(order)}
              {order.collectionStatus === 'collected' ? `, collected by ${riderName(order)}` : ''}
            </Text>
            {order.collectionNote ? <Text style={[font.caption, styles.gap]}>{order.collectionNote}</Text> : null}
          </Card>
        )}

        <Card title="Progress">
          <StatusTimeline order={order} />
        </Card>

        {canRestaurantCancel(order) && (
          <Button title="Cancel order" variant="danger" onPress={() => setCancelOpen(true)} />
        )}
      </ScrollView>

      <SheetForm
        visible={notPaidOpen}
        title="Customer didn’t pay?"
        onClose={() => setNotPaidOpen(false)}
        onSubmit={() => record('not_paid', notPaidNote.trim() || undefined)}
        submitTitle="Mark as not paid"
        submitting={recording}
        error={paymentError}
      >
        <Text style={[font.body, styles.gapBottom]}>
          The customer can’t order again until MealDirect sorts it out.
        </Text>
        <TextField label="What happened? (optional)" value={notPaidNote} onChangeText={setNotPaidNote} multiline />
      </SheetForm>

      <SheetForm
        visible={cancelOpen}
        title="Cancel this order?"
        onClose={() => setCancelOpen(false)}
        onSubmit={submitCancel}
        submitTitle="Cancel order"
        submitting={cancelling}
        error={cancelError}
      >
        {paidOnline && (
          <Banner tone="warning" message="The customer paid online. Refunds are handled by MealDirect support." />
        )}
        <View style={styles.reasons}>
          {CANCEL_REASONS.map((r) => (
            <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>
        <TextField label="Reason shown to the customer" value={reason} onChangeText={setReason} multiline />
      </SheetForm>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { gap: spacing.xs, marginBottom: spacing.lg },
  primary: { marginBottom: spacing.md, minHeight: 56 },
  gap: { marginTop: spacing.sm },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.xs },
  itemName: { flex: 1 },
  qty: { fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  payButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  flex: { flex: 1 },
  gapBottom: { marginBottom: spacing.md },
});
