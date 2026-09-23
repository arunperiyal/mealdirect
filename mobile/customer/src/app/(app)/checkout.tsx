import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Banner,
  Button,
  Card,
  Chip,
  colors,
  EmptyState,
  errorMessage,
  ErrorState,
  estimateTotals,
  font,
  formatINR,
  formatTime,
  LoadingState,
  PriceSummary,
  spacing,
  TextField,
  type DeliverySlot,
  type DeliveryType,
  type PaymentMethod,
} from '@mealdirect/shared';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearCart, selectCartSubtotal } from '@/store/cartSlice';
import {
  useCreateOrderMutation,
  useGetConfigQuery,
  useGetMenuSlotsQuery,
  useGetRestaurantQuery,
} from '@/store/serverApi';

const slotLabel = (slot: DeliverySlot) => `${formatTime(slot.startTime)} – ${formatTime(slot.endTime)}`;
const isFull = (slot: DeliverySlot) => slot.currentOrders >= slot.maxOrders;

export default function CheckoutScreen() {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const cart = useAppSelector((s) => s.cart);
  const subtotal = useAppSelector(selectCartSubtotal);

  const restaurantQuery = useGetRestaurantQuery(cart.restaurantId ?? '', { skip: !cart.restaurantId });
  const restaurant = restaurantQuery.data;

  // Until the user picks, default to whichever mode the restaurant offers, preferring delivery
  const [chosenType, setDeliveryType] = useState<DeliveryType | null>(null);
  const deliveryType: DeliveryType | null =
    chosenType ?? (restaurant ? (restaurant.deliveryEnabled ? 'delivery' : 'pickup') : null);
  const [address, setAddress] = useState('');
  const [slotId, setSlotId] = useState<string | null>(null);
  const { data: appConfig } = useGetConfigQuery();
  const onlineAvailable = appConfig?.onlinePayments === true;
  const [chosenMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  // Fall back to pay on delivery if online payment is switched off
  const paymentMethod: PaymentMethod = chosenMethod === 'online' && !onlineAvailable ? 'cod' : chosenMethod;
  const [notes, setNotes] = useState('');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [createOrder, { isLoading: placing }] = useCreateOrderMutation();

  const slotsQuery = useGetMenuSlotsQuery(cart.menuId ?? '', {
    skip: !cart.menuId || deliveryType !== 'delivery',
  });
  const slots = slotsQuery.data ?? [];
  const openSlots = slots.filter((s) => !isFull(s));

  if (cart.lines.length === 0 || !cart.menuId || !cart.restaurantId) {
    return (
      <EmptyState
        title="Nothing to check out"
        actionTitle="Browse restaurants"
        onAction={() => router.dismissTo('/')}
      />
    );
  }
  if (restaurantQuery.isLoading || deliveryType === null) {
    if (restaurantQuery.error) {
      return <ErrorState message={errorMessage(restaurantQuery.error)} onRetry={restaurantQuery.refetch} />;
    }
    return <LoadingState />;
  }
  if (!restaurant) {
    return <ErrorState message={errorMessage(restaurantQuery.error)} onRetry={restaurantQuery.refetch} />;
  }

  const estimate = estimateTotals(subtotal, deliveryType, restaurant.defaultDeliveryFee);
  const minForDelivery = Number(restaurant.minOrderForDelivery ?? 0);
  const belowMinimum = deliveryType === 'delivery' && subtotal < minForDelivery;
  const slotRequired = deliveryType === 'delivery' && openSlots.length > 0;
  const noSlotsLeft = deliveryType === 'delivery' && slots.length > 0 && openSlots.length === 0;
  const { menuId, restaurantId } = cart;

  const placeOrder = async () => {
    setFormError(null);
    if (deliveryType === 'delivery' && !address.trim()) {
      setAddressError('Enter a delivery address');
      return;
    }
    if (slotRequired && !slotId) {
      setFormError('Choose a delivery time.');
      return;
    }
    try {
      const order = await createOrder({
        restaurantId,
        menuId,
        items: cart.lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
        deliveryType,
        paymentMethod,
        ...(deliveryType === 'delivery' ? { deliveryAddress: address.trim() } : {}),
        ...(deliveryType === 'delivery' && slotId ? { deliverySlotId: slotId } : {}),
        ...(notes.trim() ? { customerNotes: notes.trim() } : {}),
      }).unwrap();

      // The order exists now, so the cart is done even if payment is abandoned;
      // the order screen offers "Pay now" until it's paid.
      dispatch(clearCart());
      router.dismissTo('/');
      router.push({
        pathname: '/order/[id]',
        params: { id: order.id, ...(paymentMethod === 'online' ? { pay: '1' } : {}) },
      });
    } catch (e) {
      setFormError(errorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {formError && <Banner tone="error" message={formError} />}

        <Card title="How do you want it?">
          <View style={styles.chips} accessibilityRole="radiogroup">
            <Chip
              label="Delivery"
              selected={deliveryType === 'delivery'}
              disabled={!restaurant.deliveryEnabled}
              onPress={() => setDeliveryType('delivery')}
            />
            <Chip
              label="Pickup"
              selected={deliveryType === 'pickup'}
              disabled={!restaurant.pickupEnabled}
              onPress={() => setDeliveryType('pickup')}
            />
          </View>

          {deliveryType === 'delivery' ? (
            <View style={styles.section}>
              <TextField
                label="Delivery address"
                value={address}
                onChangeText={(v) => {
                  setAddress(v);
                  setAddressError(null);
                }}
                error={addressError}
                placeholder="Flat, building, street, landmark"
                multiline
                autoComplete="street-address"
                textContentType="fullStreetAddress"
                style={styles.multiline}
              />
              {slotsQuery.isFetching && slots.length === 0 ? (
                <Text style={font.caption}>Loading delivery times…</Text>
              ) : slots.length > 0 ? (
                <>
                  <Text style={styles.label}>Delivery time</Text>
                  <View style={styles.chips} accessibilityRole="radiogroup">
                    {slots.map((slot) => (
                      <Chip
                        key={slot.id}
                        label={isFull(slot) ? `${slotLabel(slot)} (full)` : slotLabel(slot)}
                        selected={slotId === slot.id}
                        disabled={isFull(slot)}
                        onPress={() => setSlotId(slot.id)}
                      />
                    ))}
                  </View>
                </>
              ) : null}
              {noSlotsLeft && (
                <Banner tone="warning" message="All delivery times are full. Try pickup instead." />
              )}
              {belowMinimum && (
                <Banner
                  tone="warning"
                  message={`Delivery needs a minimum order of ${formatINR(minForDelivery)}. Add ${formatINR(minForDelivery - subtotal)} more or choose pickup.`}
                />
              )}
            </View>
          ) : (
            <Text style={[font.caption, styles.section]}>
              Pick up from {[restaurant.address, restaurant.city].filter(Boolean).join(', ') || restaurant.name}
            </Text>
          )}
        </Card>

        <Card title="Payment">
          {onlineAvailable && (
            <View style={styles.chips} accessibilityRole="radiogroup">
              <Chip
                label={deliveryType === 'pickup' ? 'Pay at pickup' : 'Pay on delivery'}
                selected={paymentMethod === 'cod'}
                onPress={() => setPaymentMethod('cod')}
              />
              <Chip label="Pay online now" selected={paymentMethod === 'online'} onPress={() => setPaymentMethod('online')} />
            </View>
          )}
          {paymentMethod === 'online' ? (
            <Text style={[font.caption, onlineAvailable && styles.section]}>
              UPI, cards, netbanking and wallets via Razorpay. Your order is confirmed once payment succeeds.
            </Text>
          ) : (
            <>
              {!onlineAvailable && (
                <Text style={font.body}>{deliveryType === 'pickup' ? 'Pay at pickup' : 'Pay on delivery'}</Text>
              )}
              <Text style={[font.caption, styles.section]}>
                {deliveryType === 'pickup'
                  ? 'Pay the restaurant in cash or by UPI when you collect your order.'
                  : 'Pay the delivery partner in cash, or by UPI with the QR code they show you, when your food arrives.'}
              </Text>
            </>
          )}
        </Card>

        <Card title="Notes for the kitchen">
          <TextField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Less spicy, no onions…"
            multiline
            maxLength={500}
            style={styles.multiline}
          />
        </Card>

        <Card title="Bill summary">
          <PriceSummary {...estimate} estimated />
          <Text style={[font.caption, styles.section]}>
            The final amount is confirmed by the restaurant when you place the order.
          </Text>
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          title={
            paymentMethod === 'online'
              ? `Place order & pay ${formatINR(estimate.total)}`
              : `Place order · ${formatINR(estimate.total)}`
          }
          onPress={placeOrder}
          loading={placing}
          disabled={belowMinimum || noSlotsLeft}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { marginTop: spacing.md },
  label: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: spacing.sm },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
