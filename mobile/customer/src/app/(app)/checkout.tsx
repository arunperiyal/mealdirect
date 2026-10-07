import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
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
  relativeDay,
  spacing,
  TextField,
  type DeliverySlot,
  type DeliveryType,
  type PaymentMethod,
  type SavedAddress,
} from '@mealdirect/shared';
import { AddressPicker, type AddressChoice } from '@/components/AddressPicker';
import { useAppDispatch, useAppSelector } from '@/store';
import { menuSubtotal, removeMenu, type CartMenu } from '@/store/cartSlice';
import {
  useAddAddressMutation,
  useCreateOrderMutation,
  useGetAddressesQuery,
  useGetConfigQuery,
  useGetMenuSlotsQuery,
  useGetRestaurantQuery,
} from '@/store/serverApi';

const slotLabel = (slot: DeliverySlot) => `${formatTime(slot.startTime)} – ${formatTime(slot.endTime)}`;
const isFull = (slot: DeliverySlot) => slot.currentOrders >= slot.maxOrders;

// What each menu's delivery times allow: a time must be chosen when any is open
interface SlotInfo {
  open: number;
  total: number;
}

const NO_ADDRESS: AddressChoice = { address: '', saveAs: null };

// The cart can hold several of the restaurant's menus (lunch and dinner...). Each becomes
// its own order with its own delivery time and bill, and can go to its own address (home
// for dinner, the office for lunch); the rest of checkout is shared.
export default function CheckoutScreen() {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const cart = useAppSelector((s) => s.cart);

  const restaurantQuery = useGetRestaurantQuery(cart.restaurantId ?? '', { skip: !cart.restaurantId });
  const restaurant = restaurantQuery.data;

  // Until the user picks, default to whichever mode the restaurant offers, preferring delivery
  const [chosenType, setDeliveryType] = useState<DeliveryType | null>(null);
  const deliveryType: DeliveryType | null =
    chosenType ?? (restaurant ? (restaurant.deliveryEnabled ? 'delivery' : 'pickup') : null);
  const [shared, setShared] = useState<AddressChoice>(NO_ADDRESS);
  // With several menus, each can have its own address
  const [sameAddress, setSameAddress] = useState(true);
  const [perMenu, setPerMenu] = useState<Record<string, AddressChoice>>({});
  const [addressErrors, setAddressErrors] = useState<Record<string, string | null>>({});
  const addressesQuery = useGetAddressesQuery();
  const [addAddress] = useAddAddressMutation();
  const [slotIds, setSlotIds] = useState<Record<string, string>>({});
  const [slotInfo, setSlotInfo] = useState<Record<string, SlotInfo>>({});
  const { data: appConfig } = useGetConfigQuery();
  // Online payment pays one order; with several menus, pay each on delivery
  const onlineAvailable = appConfig?.onlinePayments === true && cart.menus.length === 1;
  const [chosenMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  // Fall back to pay on delivery if online payment is switched off
  const paymentMethod: PaymentMethod = chosenMethod === 'online' && !onlineAvailable ? 'cod' : chosenMethod;
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  const [createOrder] = useCreateOrderMutation();
  const chooseAddress = useCallback((choice: AddressChoice) => {
    setShared(choice);
    setAddressErrors((all) => ({ ...all, shared: null }));
  }, []);
  const chooseMenuAddress = useCallback((menuId: string, choice: AddressChoice) => {
    setPerMenu((all) => ({ ...all, [menuId]: choice }));
    setAddressErrors((all) => ({ ...all, [menuId]: null }));
  }, []);
  const reportSlots = useCallback((menuId: string, info: SlotInfo) => {
    setSlotInfo((all) => (all[menuId]?.open === info.open && all[menuId]?.total === info.total ? all : { ...all, [menuId]: info }));
  }, []);

  if (cart.menus.length === 0 || !cart.restaurantId) {
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

  const { restaurantId } = cart;
  const delivering = deliveryType === 'delivery';
  const minForDelivery = Number(restaurant.minOrderForDelivery ?? 0);
  const estimates = cart.menus.map((m) => estimateTotals(menuSubtotal(m), deliveryType, restaurant.defaultDeliveryFee));
  const grandTotal = estimates.reduce((sum, e) => sum + e.total, 0);
  const belowMinimum = delivering && cart.menus.some((m) => menuSubtotal(m) < minForDelivery);
  const noSlotsLeft = delivering && cart.menus.some((m) => slotInfo[m.menuId]?.total && !slotInfo[m.menuId]?.open);
  const several = cart.menus.length > 1;
  const separateAddresses = delivering && several && !sameAddress;
  const addressFor = (menuId: string) => (separateAddresses ? perMenu[menuId] ?? NO_ADDRESS : shared);

  const placeOrder = async () => {
    setFormError(null);
    if (delivering) {
      const missing = separateAddresses
        ? Object.fromEntries(cart.menus.filter((m) => !addressFor(m.menuId).address.trim()).map((m) => [m.menuId, 'Enter a delivery address']))
        : shared.address.trim()
          ? {}
          : { shared: 'Enter a delivery address' };
      if (Object.keys(missing).length) {
        setAddressErrors(missing);
        return;
      }
    }
    const needsTime = cart.menus.find((m) => delivering && slotInfo[m.menuId]?.open && !slotIds[m.menuId]);
    if (needsTime) {
      setFormError(several ? `Choose a delivery time for ${needsTime.menuName}.` : 'Choose a delivery time.');
      return;
    }

    setPlacing(true);
    const placed: string[] = [];
    // New addresses to save, once each
    const toSave = new Map<string, string>();
    const failed: string[] = [];
    // One order per menu. A menu that fails (e.g. ordering just closed) stays in the cart.
    for (const menu of cart.menus) {
      try {
        const order = await createOrder({
          restaurantId,
          menuId: menu.menuId,
          items: menu.lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
          deliveryType,
          paymentMethod,
          ...(delivering ? { deliveryAddress: addressFor(menu.menuId).address.trim() } : {}),
          ...(delivering && slotIds[menu.menuId] ? { deliverySlotId: slotIds[menu.menuId] } : {}),
          ...(notes.trim() ? { customerNotes: notes.trim() } : {}),
        }).unwrap();
        placed.push(order.id);
        const { address, saveAs } = addressFor(menu.menuId);
        if (delivering && saveAs) toSave.set(address.trim(), saveAs);
        dispatch(removeMenu(menu.menuId));
      } catch (e) {
        failed.push(several ? `${menu.menuName}: ${errorMessage(e)}` : errorMessage(e));
      }
    }

    // Saving addresses is a convenience: orders are placed either way
    for (const [address, label] of toSave) {
      await addAddress({ label, address })
        .unwrap()
        .catch(() => {});
    }
    setPlacing(false);

    if (failed.length) {
      setFormError(
        placed.length
          ? `${placed.length} order${placed.length === 1 ? ' was' : 's were'} placed. Still in your cart: ${failed.join(' ')}`
          : failed.join(' ')
      );
      return;
    }

    // The orders exist now, so the cart is done even if payment is abandoned;
    // the order screen offers "Pay now" until it's paid.
    router.dismissTo('/');
    if (placed.length === 1) {
      router.push({
        pathname: '/order/[id]',
        params: { id: placed[0], ...(paymentMethod === 'online' ? { pay: '1' } : {}) },
      });
    } else {
      router.navigate('/orders');
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

          {delivering ? (
            <View style={styles.section}>
              {several && (
                <View style={styles.switchRow}>
                  <Text style={[font.body, styles.flex]}>Same address for all menus</Text>
                  <Switch
                    value={sameAddress}
                    onValueChange={setSameAddress}
                    accessibilityLabel="Same address for all menus"
                    trackColor={{ true: colors.success, false: colors.border }}
                  />
                </View>
              )}
              {addressesQuery.isLoading ? (
                <Text style={font.caption}>Loading your addresses…</Text>
              ) : separateAddresses ? (
                <Text style={font.caption}>Choose an address for each menu below.</Text>
              ) : (
                <AddressPicker addresses={addressesQuery.data ?? []} error={addressErrors.shared} onChange={chooseAddress} />
              )}
            </View>
          ) : (
            <Text style={[font.caption, styles.section]}>
              Pick up from {[restaurant.address, restaurant.city].filter(Boolean).join(', ') || restaurant.name}
            </Text>
          )}
        </Card>

        {several && (
          <Text style={[font.caption, styles.ordersNote]}>
            Your cart has {cart.menus.length} menus, so this places {cart.menus.length} orders, each with its own
            delivery time and bill.
          </Text>
        )}
        {cart.menus.map((menu, i) => (
          <MenuOrder
            key={menu.menuId}
            menu={menu}
            deliveryType={deliveryType}
            slotId={slotIds[menu.menuId] ?? null}
            onSlot={(id) => setSlotIds((all) => ({ ...all, [menu.menuId]: id }))}
            onSlots={reportSlots}
            address={
              separateAddresses && !addressesQuery.isLoading
                ? { addresses: addressesQuery.data ?? [], error: addressErrors[menu.menuId], onChange: chooseMenuAddress }
                : null
            }
            estimate={estimates[i]}
            minForDelivery={minForDelivery}
            showTitle={several}
          />
        ))}

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

        <Text style={[font.caption, styles.ordersNote]}>
          The final amount is confirmed by the restaurant when you place the order.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          title={
            paymentMethod === 'online'
              ? `Place order & pay ${formatINR(grandTotal)}`
              : `Place ${several ? `${cart.menus.length} orders` : 'order'} · ${formatINR(grandTotal)}`
          }
          onPress={placeOrder}
          loading={placing}
          disabled={belowMinimum || Boolean(noSlotsLeft)}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

// One menu's order: its delivery time and its bill
function MenuOrder({
  menu,
  deliveryType,
  slotId,
  onSlot,
  onSlots,
  address,
  estimate,
  minForDelivery,
  showTitle,
}: {
  menu: CartMenu;
  deliveryType: DeliveryType;
  slotId: string | null;
  onSlot: (id: string) => void;
  onSlots: (menuId: string, info: SlotInfo) => void;
  // When the menus go to different addresses: this menu's own picker
  address: {
    addresses: SavedAddress[];
    error?: string | null;
    onChange: (menuId: string, choice: AddressChoice) => void;
  } | null;
  estimate: ReturnType<typeof estimateTotals>;
  minForDelivery: number;
  showTitle: boolean;
}) {
  const delivering = deliveryType === 'delivery';
  const slotsQuery = useGetMenuSlotsQuery(menu.menuId, { skip: !delivering });
  const slots = slotsQuery.data;
  const subtotal = menuSubtotal(menu);

  useEffect(() => {
    if (slots) onSlots(menu.menuId, { open: slots.filter((s) => !isFull(s)).length, total: slots.length });
  }, [slots, menu.menuId, onSlots]);
  // Stable per menu, so the picker's effect doesn't run on every render
  const onAddress = address?.onChange;
  const chooseAddress = useCallback((choice: AddressChoice) => onAddress?.(menu.menuId, choice), [onAddress, menu.menuId]);

  return (
    <Card title={showTitle ? `${menu.menuName} · ${relativeDay(menu.menuDate)}` : 'Bill summary'}>
      {delivering && (
        <>
          {address && (
            <View style={styles.slots}>
              <AddressPicker addresses={address.addresses} error={address.error} onChange={chooseAddress} />
            </View>
          )}
          {slotsQuery.isFetching && !slots ? (
            <Text style={font.caption}>Loading delivery times…</Text>
          ) : slots && slots.length > 0 ? (
            <View style={styles.slots}>
              <Text style={styles.label}>Delivery time</Text>
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={`Delivery time for ${menu.menuName}`}>
                {slots.map((slot) => (
                  <Chip
                    key={slot.id}
                    label={isFull(slot) ? `${slotLabel(slot)} (full)` : slotLabel(slot)}
                    selected={slotId === slot.id}
                    disabled={isFull(slot)}
                    onPress={() => onSlot(slot.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          {slots && slots.length > 0 && slots.every(isFull) && (
            <Banner tone="warning" message="All delivery times are full. Try pickup instead." />
          )}
          {subtotal < minForDelivery && (
            <Banner
              tone="warning"
              message={`Delivery needs a minimum order of ${formatINR(minForDelivery)}${showTitle ? ' per menu' : ''}. Add ${formatINR(minForDelivery - subtotal)} more or choose pickup.`}
            />
          )}
        </>
      )}
      <PriceSummary {...estimate} estimated />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { marginTop: spacing.md },
  slots: { marginBottom: spacing.md },
  ordersNote: { marginBottom: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  flex: { flex: 1 },
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
