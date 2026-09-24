import { useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import {
  Banner,
  Button,
  Card,
  colors,
  confirmAction,
  customerName,
  errorMessage,
  ErrorState,
  font,
  formatINR,
  formatTime,
  isActive,
  LoadingState,
  paymentLabel,
  shortId,
  spacing,
  type Collection,
  type Order,
} from '@mealdirect/shared';
import { ORDER_POLL_MS } from '@/config';
import { canRelease, cashToCollect, mapsUrl, restaurantPlace, riderStep } from '@/lib/riderSteps';
import { useAppSelector } from '@/store';
import { PaymentSheet } from '@/components/PaymentSheet';
import { serverApi, useActMutation, useGetDeliveryQuery } from '@/store/serverApi';

export default function DeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const focused = useIsFocused();

  // Keep checking while the restaurant prepares it; stop once it's finished
  const selectCached = useMemo(() => serverApi.endpoints.getDelivery.select(id), [id]);
  const cached = useAppSelector(selectCached).data;
  const poll = focused && (!cached || isActive(cached));

  const { data: order, error, isLoading, isFetching, refetch } = useGetDeliveryQuery(id, {
    pollingInterval: poll ? ORDER_POLL_MS : 0,
  });

  if (isLoading) return <LoadingState />;
  if (!order) return <ErrorState message={errorMessage(error, 'Delivery not found')} onRetry={refetch} />;
  return <Details order={order} refreshing={isFetching} onRefresh={refetch} />;
}

function Details({ order, refreshing, onRefresh }: { order: Order; refreshing: boolean; onRefresh: () => void }) {
  const me = useAppSelector((s) => s.auth.user?.id);
  const [act, { isLoading }] = useActMutation();
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const mine = order.riderId === me;
  const step = riderStep(order);
  const cash = cashToCollect(order);
  const items = order.items.reduce((n, i) => n + i.quantity, 0);

  const run = async (action: 'claim' | 'pick-up' | 'deliver' | 'release') => {
    setError(null);
    try {
      await act({ id: order.id, action }).unwrap();
      if (action === 'release') router.back();
    } catch (e) {
      setError(errorMessage(e));
      onRefresh();
    }
  };

  // Paid online: just deliver. Pay on delivery: record how the customer paid first.
  const confirmDeliver = () => {
    if (!cash) return run('deliver');
    setPayError(null);
    setPaying(true);
  };

  const recordPayment = async (collection: Collection, note?: string) => {
    setPayError(null);
    try {
      await act({ id: order.id, action: 'deliver', collection, note }).unwrap();
      setPaying(false);
    } catch (e) {
      setPayError(errorMessage(e));
    }
  };

  const confirmRelease = () =>
    confirmAction({
      title: 'Give this delivery back?',
      message: 'It goes back to the queue for another partner.',
      confirmText: 'Give back',
      cancelText: 'Keep it',
      destructive: true,
      onConfirm: () => run('release'),
    });

  const call = (phone: string | null | undefined) => phone && Linking.openURL(`tel:${phone}`);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
    >
      <View style={styles.header}>
        <Text style={font.caption}>{shortId(order.id)}</Text>
        <Text style={font.title}>
          {order.paymentMethod !== 'cod'
            ? 'Paid online'
            : cash
              ? `Collect ${formatINR(cash)}`
              : paymentLabel(order)}
        </Text>
        {cash ? (
          <Text style={font.caption}>{order.restaurant?.upiId ? 'Cash, or UPI to the restaurant' : 'Cash'}</Text>
        ) : null}
        <Text style={font.caption}>
          {items} {items === 1 ? 'item' : 'items'} ·{' '}
          {order.deliverySlot
            ? `deliver ${formatTime(order.deliverySlot.startTime)}–${formatTime(order.deliverySlot.endTime)}`
            : 'deliver as soon as possible'}
        </Text>
      </View>

      {error && <Banner tone="error" message={error} />}

      {!mine && order.riderId == null ? (
        <Button title="Accept delivery" onPress={() => run('claim')} loading={isLoading} style={styles.primary} />
      ) : mine && step.kind === 'action' ? (
        <Button
          title={step.label}
          onPress={step.action === 'deliver' ? confirmDeliver : () => run(step.action)}
          loading={isLoading}
          style={styles.primary}
        />
      ) : (
        <Banner
          tone={step.kind === 'done' ? 'success' : 'warning'}
          message={step.kind === 'action' ? 'Another delivery partner is handling this order.' : step.message}
        />
      )}

      <Card title="Pick up">
        <Text style={font.heading}>{order.restaurant?.name ?? 'Restaurant'}</Text>
        <Text style={font.body}>{restaurantPlace(order) || '—'}</Text>
        <View style={styles.actions}>
          {order.restaurant?.phone ? (
            <Button title="Call" variant="secondary" onPress={() => call(order.restaurant?.phone)} style={styles.flex} />
          ) : null}
          <Button
            title="Map"
            variant="secondary"
            onPress={() => Linking.openURL(mapsUrl(order.restaurant?.name, restaurantPlace(order)))}
            style={styles.flex}
          />
        </View>
      </Card>

      <Card title="Drop">
        <Text style={font.heading}>{customerName(order)}</Text>
        <Text style={font.body}>{order.deliveryAddress ?? '—'}</Text>
        {order.customerNotes ? <Text style={[font.caption, styles.gap]}>Note: {order.customerNotes}</Text> : null}
        {mine && (
          <View style={styles.actions}>
            {order.customer?.phone ? (
              <Button title="Call" variant="secondary" onPress={() => call(order.customer?.phone)} style={styles.flex} />
            ) : null}
            <Button
              title="Map"
              variant="secondary"
              onPress={() => Linking.openURL(mapsUrl(order.deliveryAddress))}
              style={styles.flex}
            />
          </View>
        )}
        {!mine && <Text style={[font.caption, styles.gap]}>The customer’s phone number shows once you accept.</Text>}
      </Card>

      <Card title="Items">
        {order.items.map((item) => (
          <Text key={item.menuItemId} style={font.body}>
            {item.quantity} × {item.name}
          </Text>
        ))}
        <Text style={[font.caption, styles.gap]}>Order total {formatINR(order.total)}</Text>
      </Card>

      {mine && canRelease(order) && (
        <Button title="Give this delivery back" variant="danger" onPress={confirmRelease} />
      )}

      <PaymentSheet
        visible={paying}
        amount={cash}
        reference={shortId(order.id)}
        upi={order.restaurant?.upiId ? { id: order.restaurant.upiId, name: order.restaurant.name } : null}
        submitting={isLoading}
        error={payError}
        onClose={() => setPaying(false)}
        onSubmit={recordPayment}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { gap: spacing.xs, marginBottom: spacing.lg },
  primary: { marginBottom: spacing.md, minHeight: 56 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  flex: { flex: 1 },
  gap: { marginTop: spacing.sm },
});
