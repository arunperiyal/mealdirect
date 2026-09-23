import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import {
  Banner,
  Button,
  canCancel,
  canMarkPickedUp,
  Card,
  colors,
  errorMessage,
  ErrorState,
  font,
  formatDateTime,
  formatINR,
  isActive,
  LoadingState,
  needsPayment,
  PriceSummary,
  spacing,
  STATUS_LABELS,
  StatusTimeline,
  type Order,
  riderName,
  paymentLabel,
} from '@mealdirect/shared';
import { ORDER_POLL_MS } from '@/config';
import { RazorpayCheckout } from '@/payments/RazorpayCheckout';
import { useOrderPayment } from '@/payments/useOrderPayment';
import { useAppSelector } from '@/store';
import {
  serverApi,
  useCancelOrderMutation,
  useGetConfigQuery,
  useGetOrderQuery,
  useGetRestaurantQuery,
  useMarkPickedUpMutation,
} from '@/store/serverApi';

export default function OrderScreen() {
  const { id, pay } = useLocalSearchParams<{ id: string; pay?: string }>();
  const focused = useIsFocused();

  // Stop polling once the order can no longer change
  const selectCached = useMemo(() => serverApi.endpoints.getOrder.select(id), [id]);
  const cached = useAppSelector(selectCached).data;
  const poll = focused && (!cached || isActive(cached));

  const { data: order, error, isLoading, isFetching, refetch } = useGetOrderQuery(id, {
    pollingInterval: poll ? ORDER_POLL_MS : 0,
  });

  if (isLoading) return <LoadingState />;
  if (!order) {
    return <ErrorState message={errorMessage(error, 'Order not found')} onRetry={refetch} />;
  }

  return (
    <OrderDetails
      order={order}
      autoPay={pay === '1'}
      refreshing={isFetching}
      onRefresh={refetch}
    />
  );
}

function OrderDetails({
  order,
  autoPay,
  refreshing,
  onRefresh,
}: {
  order: Order;
  autoPay: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const user = useAppSelector((s) => s.auth.user);
  const { data: restaurant } = useGetRestaurantQuery(order.restaurantId);
  const payment = useOrderPayment(order.id);
  const [cancelOrder, { isLoading: cancelling }] = useCancelOrderMutation();
  const [markPickedUp, { isLoading: markingPickedUp }] = useMarkPickedUpMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: appConfig } = useGetConfigQuery();
  const onlineAvailable = appConfig?.onlinePayments !== false;
  const unpaid = needsPayment(order);
  const paidOnline = order.paymentMethod !== 'cod' && order.paymentStatus === 'completed';

  // Coming straight from checkout: open Razorpay once, then drop the flag
  const autoPayStarted = useRef(false);
  useEffect(() => {
    if (autoPay && unpaid && onlineAvailable && !autoPayStarted.current) {
      autoPayStarted.current = true;
      router.setParams({ pay: undefined });
      payment.start();
    }
  }, [autoPay, unpaid, onlineAvailable, payment]);

  const confirmCancel = () => {
    Alert.alert(
      'Cancel this order?',
      paidOnline
        ? "You've already paid for this order. Refunds are processed by our team and can take a few days."
        : 'The restaurant will be notified.',
      [
        { text: 'Keep order', style: 'cancel' },
        {
          text: 'Cancel order',
          style: 'destructive',
          onPress: async () => {
            setActionError(null);
            try {
              await cancelOrder({ id: order.id, reason: 'Cancelled by customer' }).unwrap();
            } catch (e) {
              setActionError(errorMessage(e));
            }
          },
        },
      ]
    );
  };

  const onPickedUp = async () => {
    setActionError(null);
    try {
      await markPickedUp(order.id).unwrap();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  const customerName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <Text style={font.title}>{STATUS_LABELS[order.status]}</Text>
          <Text style={font.caption}>
            {restaurant?.name ? `${restaurant.name} · ` : ''}Order #{order.id.slice(0, 8).toUpperCase()}
          </Text>
        </View>

        {actionError && <Banner tone="error" message={actionError} />}

        {payment.phase === 'verifying' && <Banner tone="warning" message="Confirming your payment…" />}
        {payment.phase === 'paid' && <Banner tone="success" message="Payment successful. Your order is confirmed." />}
        {payment.error && <Banner tone="error" message={payment.error} />}
        {order.collectionStatus === 'not_paid' && (
          <Banner
            tone="error"
            message="This order is marked as not paid. Please contact MealDirect support to settle it. You can’t place new orders until then."
          />
        )}

        {unpaid && payment.phase !== 'verifying' && (
          <Card>
            <Text style={font.heading}>Payment pending</Text>
            {onlineAvailable ? (
              <>
                <Text style={[font.caption, styles.gap]}>
                  {order.paymentStatus === 'failed'
                    ? 'Your last payment attempt failed. The restaurant will start once payment goes through.'
                    : 'Complete payment so the restaurant can start preparing your order.'}
                </Text>
                <Button
                  title={`Pay ${formatINR(order.total)}`}
                  onPress={payment.start}
                  loading={payment.phase === 'starting'}
                  style={styles.gap}
                />
              </>
            ) : (
              <Text style={[font.caption, styles.gap]}>
                Online payment isn’t available right now. Cancel this order and order again with pay on delivery.
              </Text>
            )}
          </Card>
        )}

        {order.rider && isActive(order) && (
          <Card title="Your delivery partner">
            <Text style={font.body}>
              {riderName(order)} {order.status === 'out_for_delivery' ? 'is on the way with your order.' : 'will deliver your order.'}
            </Text>
            {order.rider.phone ? (
              <Button
                title={`Call ${order.rider.phone}`}
                variant="secondary"
                onPress={() => Linking.openURL(`tel:${order.rider!.phone}`)}
                style={styles.gap}
              />
            ) : null}
          </Card>
        )}

        <Card title="Status">
          <StatusTimeline order={order} />
        </Card>

        <Card title="Items">
          {order.items.map((item) => (
            <View key={item.menuItemId} style={styles.itemRow}>
              <Text style={[font.body, styles.itemName]}>
                {item.quantity} × {item.name}
              </Text>
              <Text style={font.body}>{formatINR(item.total)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <PriceSummary
            subtotal={order.subtotal}
            tax={order.tax}
            deliveryFee={order.deliveryFee}
            total={order.total}
          />
        </Card>

        <Card title="Details">
          <Detail label="Placed" value={formatDateTime(order.createdAt)} />
          <Detail
            label={order.deliveryType === 'delivery' ? 'Delivery to' : 'Pickup from'}
            value={
              order.deliveryType === 'delivery'
                ? order.deliveryAddress ?? '—'
                : [restaurant?.address, restaurant?.city].filter(Boolean).join(', ') || restaurant?.name || '—'
            }
          />
          <Detail
            label="Payment"
            value={
              order.paymentMethod === 'cod' ? paymentLabel(order) : paidOnline ? 'Paid online' : 'Online · not paid yet'
            }
          />
          {order.customerNotes ? <Detail label="Notes" value={order.customerNotes} /> : null}
          {restaurant?.phone ? <Detail label="Restaurant phone" value={restaurant.phone} /> : null}
        </Card>

        {canMarkPickedUp(order) && (
          <Button title="I've picked up my order" onPress={onPickedUp} loading={markingPickedUp} style={styles.gap} />
        )}
        {canCancel(order) && (
          <Button title="Cancel order" variant="danger" onPress={confirmCancel} loading={cancelling} style={styles.gap} />
        )}
      </ScrollView>

      <RazorpayCheckout
        {...payment.checkoutProps}
        description={`Order #${order.id.slice(0, 8).toUpperCase()}${restaurant?.name ? ` · ${restaurant.name}` : ''}`}
        prefill={{ name: customerName || undefined, email: user?.email }}
      />
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
  header: { marginBottom: spacing.lg, gap: spacing.xs },
  gap: { marginTop: spacing.md },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs, gap: spacing.md },
  itemName: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md },
  detail: { marginBottom: spacing.md, gap: 2 },
});
