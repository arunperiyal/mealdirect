import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  Banner,
  Button,
  Card,
  colors,
  type DeliverySlot,
  errorMessage,
  ErrorState,
  font,
  formatINR,
  formatTime,
  LoadingState,
  type Menu,
  type MenuItem,
  SheetForm,
  spacing,
  TextField,
} from '@mealdirect/shared';
import { dayLabel, isBefore, isValidTime, toHHmm } from '@/lib/time';
import { useRestaurant } from '@/lib/useRestaurant';
import { validateMoney } from '@/lib/validation';
import {
  useAddMenuItemMutation,
  useAddSlotMutation,
  useDeleteSlotMutation,
  useGetMenuQuery,
  useGetMenuSlotsQuery,
  useRemoveMenuItemMutation,
  useSetMenuStatusMutation,
  useUpdateMenuItemMutation,
  useUpdateSlotMutation,
} from '@/store/serverApi';

type ItemDraft = { id?: string; name: string; description: string; price: string; available: boolean };
type SlotDraft = { id?: string; startTime: string; endTime: string; maxOrders: string; currentOrders: number };

export default function MenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: menu, error, isLoading, isFetching, refetch } = useGetMenuQuery(id);

  if (isLoading) return <LoadingState />;
  if (!menu) return <ErrorState message={errorMessage(error, 'Menu not found')} onRetry={refetch} />;
  return <MenuEditor menu={menu} refreshing={isFetching} onRefresh={refetch} />;
}

function MenuEditor({ menu, refreshing, onRefresh }: { menu: Menu; refreshing: boolean; onRefresh: () => void }) {
  const restaurant = useRestaurant();
  const [setMenuStatus, { isLoading: changingStatus }] = useSetMenuStatusMutation();
  const [updateItem] = useUpdateMenuItemMutation();
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<ItemDraft | null>(null);
  const [slot, setSlot] = useState<SlotDraft | null>(null);

  const soldOut = menu.items.filter((i) => !i.available).length;

  const publish = async () => {
    setError(null);
    try {
      await setMenuStatus({ id: menu.id, action: 'publish' }).unwrap();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const close = () =>
    Alert.alert('Stop taking orders?', 'Customers won’t be able to order from this menu. You can’t reopen it.', [
      { text: 'Keep open', style: 'cancel' },
      {
        text: 'Close menu',
        style: 'destructive',
        onPress: async () => {
          setError(null);
          try {
            await setMenuStatus({ id: menu.id, action: 'close' }).unwrap();
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);

  const toggleAvailable = async (menuItem: MenuItem, available: boolean) => {
    setError(null);
    try {
      await updateItem({ menuId: menu.id, itemId: menuItem.id, changes: { available } }).unwrap();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: `${dayLabel(menu.date)}’s menu` }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {error && <Banner tone="error" message={error} />}

        <Card>
          <Text style={font.heading}>
            {menu.status === 'draft'
              ? 'Draft'
              : menu.status === 'published'
                ? 'Open for orders'
                : 'Closed for orders'}
          </Text>
          <Text style={[font.caption, styles.gap]}>
            {menu.status === 'draft'
              ? 'Customers can’t see this menu until you publish it.'
              : menu.status === 'published'
                ? `Customers can order now.${soldOut ? ` ${soldOut} sold out.` : ''} Switch dishes off when they run out.`
                : 'This menu no longer takes orders.'}
          </Text>
          {menu.orderingStartTime && menu.orderingEndTime ? (
            <Text style={[font.caption, styles.gap]}>
              Ordering window {formatTime(menu.orderingStartTime)}–{formatTime(menu.orderingEndTime)}
            </Text>
          ) : null}
          {menu.status === 'draft' && (
            <Button
              title={menu.items.length ? 'Publish menu' : 'Add a dish to publish'}
              onPress={publish}
              disabled={!menu.items.length}
              loading={changingStatus}
              style={styles.gap}
            />
          )}
          {menu.status === 'published' && (
            <Button title="Stop taking orders" variant="danger" onPress={close} loading={changingStatus} style={styles.gap} />
          )}
        </Card>

        <Card title={`Dishes (${menu.items.length})`}>
          {menu.items.length === 0 && <Text style={font.caption}>No dishes yet.</Text>}
          {menu.items.map((menuItem) => (
            <View key={menuItem.id} style={styles.itemRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${menuItem.name}`}
                style={styles.itemText}
                onPress={() =>
                  setItem({
                    id: menuItem.id,
                    name: menuItem.name,
                    description: menuItem.description ?? '',
                    price: String(menuItem.price),
                    available: menuItem.available,
                  })
                }
              >
                <Text style={[font.body, !menuItem.available && styles.soldOut]}>{menuItem.name}</Text>
                <Text style={font.caption}>
                  {formatINR(menuItem.price)}
                  {menuItem.available ? '' : ' · sold out'}
                </Text>
              </Pressable>
              <Switch
                accessibilityLabel={`${menuItem.name} available`}
                value={menuItem.available}
                onValueChange={(v) => toggleAvailable(menuItem, v)}
                trackColor={{ true: colors.success, false: colors.border }}
              />
            </View>
          ))}
          <Button
            title="Add dish"
            variant="secondary"
            onPress={() => setItem({ name: '', description: '', price: '', available: true })}
            style={styles.gap}
          />
        </Card>

        {restaurant.deliveryEnabled ? (
          <SlotsCard menuId={menu.id} onEdit={setSlot} />
        ) : (
          <Card title="Delivery times">
            <Text style={font.caption}>Delivery is off for this restaurant. Turn it on in Settings to add delivery times.</Text>
          </Card>
        )}
      </ScrollView>

      {item && <ItemSheet menuId={menu.id} draft={item} onClose={() => setItem(null)} />}
      {slot && <SlotSheet menuId={menu.id} draft={slot} onClose={() => setSlot(null)} />}
    </>
  );
}

function SlotsCard({ menuId, onEdit }: { menuId: string; onEdit: (draft: SlotDraft) => void }) {
  const { data: slots = [], isLoading } = useGetMenuSlotsQuery(menuId);
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const edit = (s: DeliverySlot) =>
    onEdit({
      id: s.id,
      startTime: toHHmm(s.startTime),
      endTime: toHHmm(s.endTime),
      maxOrders: String(s.maxOrders),
      currentOrders: s.currentOrders,
    });

  return (
    <Card title="Delivery times">
      <Text style={[font.caption, styles.hintBelowTitle]}>
        Customers choose one when ordering delivery. Each has a limit on orders.
      </Text>
      {isLoading && <Text style={font.caption}>Loading…</Text>}
      {sorted.map((s) => (
        <Pressable
          key={s.id}
          accessibilityRole="button"
          onPress={() => edit(s)}
          style={({ pressed }) => [styles.slotRow, pressed && { opacity: 0.7 }]}
        >
          <Text style={font.body}>
            {formatTime(s.startTime)} – {formatTime(s.endTime)}
          </Text>
          <Text style={[font.caption, s.currentOrders >= s.maxOrders && { color: colors.danger }]}>
            {s.currentOrders}/{s.maxOrders} booked
          </Text>
        </Pressable>
      ))}
      <Button
        title="Add delivery time"
        variant="secondary"
        onPress={() => onEdit({ startTime: '', endTime: '', maxOrders: '10', currentOrders: 0 })}
        style={styles.gap}
      />
    </Card>
  );
}

function ItemSheet({ menuId, draft, onClose }: { menuId: string; draft: ItemDraft; onClose: () => void }) {
  const [form, setForm] = useState(draft);
  const [errors, setErrors] = useState<{ name?: string | null; price?: string | null }>({});
  const [error, setError] = useState<string | null>(null);
  const [addItem, adding] = useAddMenuItemMutation();
  const [updateItem, updating] = useUpdateMenuItemMutation();
  const [removeItem] = useRemoveMenuItemMutation();

  const submit = async () => {
    const next = {
      name: form.name.trim() ? null : 'Enter a name',
      price: !form.price.trim() ? 'Enter a price' : validateMoney(form.price, 'Price'),
    };
    setErrors(next);
    if (next.name || next.price) return;

    const values = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      available: form.available,
    };
    setError(null);
    try {
      if (form.id) await updateItem({ menuId, itemId: form.id, changes: values }).unwrap();
      else await addItem({ menuId, item: values }).unwrap();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = () =>
    Alert.alert(`Remove ${draft.name}?`, 'Orders already placed keep this dish.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeItem({ menuId, itemId: draft.id! }).unwrap();
            onClose();
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);

  return (
    <SheetForm
      visible
      title={form.id ? 'Edit dish' : 'Add dish'}
      onClose={onClose}
      onSubmit={submit}
      submitTitle={form.id ? 'Save dish' : 'Add dish'}
      submitting={adding.isLoading || updating.isLoading}
      error={error}
      destructiveTitle={form.id ? 'Remove dish' : undefined}
      onDestructive={form.id ? remove : undefined}
    >
      <TextField label="Name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} error={errors.name} />
      <TextField
        label="Price (₹)"
        value={form.price}
        onChangeText={(price) => setForm({ ...form, price })}
        error={errors.price}
        keyboardType="decimal-pad"
        placeholder="120"
      />
      <TextField
        label="Description (optional)"
        value={form.description}
        onChangeText={(description) => setForm({ ...form, description })}
        placeholder="Rice, sambar, rasam, 2 curries"
        multiline
      />
      <View style={styles.switchRow}>
        <Text style={font.body}>Available</Text>
        <Switch
          value={form.available}
          onValueChange={(available) => setForm({ ...form, available })}
          trackColor={{ true: colors.success, false: colors.border }}
        />
      </View>
    </SheetForm>
  );
}

function SlotSheet({ menuId, draft, onClose }: { menuId: string; draft: SlotDraft; onClose: () => void }) {
  const [form, setForm] = useState(draft);
  const [errors, setErrors] = useState<{ start?: string | null; end?: string | null; max?: string | null }>({});
  const [error, setError] = useState<string | null>(null);
  const [addSlot, adding] = useAddSlotMutation();
  const [updateSlot, updating] = useUpdateSlotMutation();
  const [deleteSlot] = useDeleteSlotMutation();

  const submit = async () => {
    const max = Number(form.maxOrders);
    const next = {
      start: isValidTime(form.startTime) ? null : 'Use 24-hour time, like 12:30',
      end: !isValidTime(form.endTime)
        ? 'Use 24-hour time, like 13:00'
        : isValidTime(form.startTime) && !isBefore(form.startTime, form.endTime)
          ? 'Must be after the start time'
          : null,
      max: !Number.isInteger(max) || max < 1
        ? 'Enter a whole number of orders'
        : max < draft.currentOrders
          ? `${draft.currentOrders} orders are already booked in this slot`
          : null,
    };
    setErrors(next);
    if (next.start || next.end || next.max) return;

    const values = { startTime: form.startTime.trim(), endTime: form.endTime.trim(), maxOrders: max };
    setError(null);
    try {
      if (form.id) await updateSlot({ id: form.id, ...values }).unwrap();
      else await addSlot({ menuId, ...values }).unwrap();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = async () => {
    try {
      await deleteSlot(draft.id!).unwrap();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <SheetForm
      visible
      title={form.id ? 'Edit delivery time' : 'Add delivery time'}
      onClose={onClose}
      onSubmit={submit}
      submitTitle={form.id ? 'Save' : 'Add'}
      submitting={adding.isLoading || updating.isLoading}
      error={error}
      destructiveTitle={form.id && draft.currentOrders === 0 ? 'Delete delivery time' : undefined}
      onDestructive={form.id && draft.currentOrders === 0 ? remove : undefined}
    >
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField
            label="From"
            value={form.startTime}
            onChangeText={(startTime) => setForm({ ...form, startTime })}
            error={errors.start}
            placeholder="12:30"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
        </View>
        <View style={styles.half}>
          <TextField
            label="To"
            value={form.endTime}
            onChangeText={(endTime) => setForm({ ...form, endTime })}
            error={errors.end}
            placeholder="13:00"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
        </View>
      </View>
      <TextField
        label="Maximum orders"
        value={form.maxOrders}
        onChangeText={(maxOrders) => setForm({ ...form, maxOrders })}
        error={errors.max}
        keyboardType="number-pad"
      />
      {draft.currentOrders > 0 && (
        <Text style={font.caption}>
          {draft.currentOrders} {draft.currentOrders === 1 ? 'order is' : 'orders are'} booked, so this time can’t be
          deleted.
        </Text>
      )}
    </SheetForm>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  gap: { marginTop: spacing.md },
  hintBelowTitle: { marginTop: -spacing.sm, marginBottom: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemText: { flex: 1, gap: 2, minHeight: 44, justifyContent: 'center' },
  soldOut: { color: colors.textMuted, textDecorationLine: 'line-through' },
  slotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
});
