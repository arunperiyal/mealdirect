import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  Banner,
  Button,
  Card,
  colors,
  confirmAction,
  errorMessage,
  ErrorState,
  font,
  formatTime,
  LoadingState,
  SheetForm,
  spacing,
  TextField,
  type DeliverySlot,
  type Menu,
  type MenuItem,
} from '@mealdirect/shared';
import { dayLabel, isBefore, isValidTime, toHHmm } from '@/lib/time';
import { useRestaurant } from '@/lib/useRestaurant';
import { DishFields } from '@/components/DishFields';
import { checkDishDraft, dishDraft, dishSummary, emptyDishDraft, type DishDraft, type DishErrors } from '@/lib/dishForm';
import {
  useAddDishesToMenuMutation,
  useCreateDishMutation,
  useGetDishesQuery,
  useAddSlotMutation,
  useDeleteSlotMutation,
  useGetMenuQuery,
  useGetMenuSlotsQuery,
  useRemoveMenuItemMutation,
  useSetMenuStatusMutation,
  useUpdateMenuItemMutation,
  useUpdateSlotMutation,
} from '@/store/serverApi';

// A dish on this menu, being edited (id set) or created (no id)
type ItemDraft = DishDraft & { id?: string; available: boolean };

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
  const [picking, setPicking] = useState(false);
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
    confirmAction({
      title: 'Stop taking orders?',
      message: 'Customers won’t be able to order from this menu. You can’t reopen it.',
      confirmText: 'Close menu',
      cancelText: 'Keep open',
      destructive: true,
      onConfirm: async () => {
        setError(null);
        try {
          await setMenuStatus({ id: menu.id, action: 'close' }).unwrap();
        } catch (e) {
          setError(errorMessage(e));
        }
      },
    });

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
                onPress={() => setItem({ id: menuItem.id, ...dishDraft(menuItem), available: menuItem.available })}
              >
                <Text style={[font.body, !menuItem.available && styles.soldOut]}>{menuItem.name}</Text>
                <Text style={font.caption}>{dishSummary(menuItem)}</Text>
              </Pressable>
              <Switch
                accessibilityLabel={`${menuItem.name} available`}
                value={menuItem.available}
                onValueChange={(v) => toggleAvailable(menuItem, v)}
                trackColor={{ true: colors.success, false: colors.border }}
              />
            </View>
          ))}
          <Button title="Add dishes" variant="secondary" onPress={() => setPicking(true)} style={styles.gap} />
        </Card>

        {restaurant.deliveryEnabled ? (
          <SlotsCard menuId={menu.id} onEdit={setSlot} />
        ) : (
          <Card title="Delivery times">
            <Text style={font.caption}>Delivery is off for this restaurant. Turn it on in Settings to add delivery times.</Text>
          </Card>
        )}
      </ScrollView>

      {picking && (
        <PickDishesSheet
          menu={menu}
          restaurantId={restaurant.id}
          onClose={() => setPicking(false)}
          onNewDish={() => {
            setPicking(false);
            setItem({ ...emptyDishDraft, available: true });
          }}
        />
      )}
      {item && <ItemSheet menu={menu} restaurantId={restaurant.id} draft={item} onClose={() => setItem(null)} />}
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

// Edit a dish on this menu (this menu only), or create a new dish: it's saved to
// My dishes and added to this menu
function ItemSheet({
  menu,
  restaurantId,
  draft,
  onClose,
}: {
  menu: Menu;
  restaurantId: string;
  draft: ItemDraft;
  onClose: () => void;
}) {
  const [form, setForm] = useState(draft);
  const [errors, setErrors] = useState<DishErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [createDish, creating] = useCreateDishMutation();
  const [addDishes, adding] = useAddDishesToMenuMutation();
  const [updateItem, updating] = useUpdateMenuItemMutation();
  const [removeItem] = useRemoveMenuItemMutation();

  const submit = async () => {
    const { errors: next, values } = checkDishDraft(form);
    setErrors(next);
    if (!values) return;
    setError(null);
    try {
      if (form.id) {
        await updateItem({ menuId: menu.id, itemId: form.id, changes: { ...values, available: form.available } }).unwrap();
      } else {
        const dish = await createDish({ restaurantId, ...values }).unwrap();
        await addDishes({ menuId: menu.id, dishIds: [dish.id] }).unwrap();
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = () =>
    confirmAction({
      title: `Remove ${draft.name} from this menu?`,
      message: 'Orders already placed keep this dish. It stays in My dishes.',
      confirmText: 'Remove',
      cancelText: 'Keep',
      destructive: true,
      onConfirm: async () => {
        try {
          await removeItem({ menuId: menu.id, itemId: draft.id! }).unwrap();
          onClose();
        } catch (e) {
          setError(errorMessage(e));
        }
      },
    });

  return (
    <SheetForm
      visible
      title={form.id ? 'Edit dish on this menu' : 'New dish'}
      onClose={onClose}
      onSubmit={submit}
      submitTitle={form.id ? 'Save dish' : 'Save and add to menu'}
      submitting={creating.isLoading || adding.isLoading || updating.isLoading}
      error={error}
      destructiveTitle={form.id ? 'Remove from menu' : undefined}
      onDestructive={form.id ? remove : undefined}
    >
      <Text style={[font.caption, styles.hintBelowTitle]}>
        {form.id
          ? 'Changes apply to this menu only. Change the dish in My dishes for future menus.'
          : 'It’s saved to My dishes too, so you can add it to other menus.'}
      </Text>
      <DishFields draft={form} errors={errors} onChange={(d) => setForm({ ...form, ...d })} />
      {form.id && (
        <View style={styles.switchRow}>
          <Text style={font.body}>Available</Text>
          <Switch
            value={form.available}
            onValueChange={(available) => setForm({ ...form, available })}
            trackColor={{ true: colors.success, false: colors.border }}
          />
        </View>
      )}
    </SheetForm>
  );
}

// Tick dishes from My dishes to put on this menu
function PickDishesSheet({
  menu,
  restaurantId,
  onClose,
  onNewDish,
}: {
  menu: Menu;
  restaurantId: string;
  onClose: () => void;
  onNewDish: () => void;
}) {
  const { data: dishes, isLoading } = useGetDishesQuery({ restaurantId });
  const [addDishes, { isLoading: adding }] = useAddDishesToMenuMutation();
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onMenu = new Set(menu.items.map((i) => i.dishId).filter(Boolean));
  const available = (dishes ?? []).filter((d) => !onMenu.has(d.id));
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const submit = async () => {
    if (chosen.length === 0) {
      setError('Tick the dishes to add.');
      return;
    }
    setError(null);
    try {
      await addDishes({ menuId: menu.id, dishIds: chosen }).unwrap();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <SheetForm
      visible
      title="Add dishes"
      onClose={onClose}
      onSubmit={submit}
      submitTitle={chosen.length ? `Add ${chosen.length} ${chosen.length === 1 ? 'dish' : 'dishes'}` : 'Add dishes'}
      submitting={adding}
      error={error}
      destructiveTitle="New dish"
      onDestructive={onNewDish}
    >
      {isLoading ? (
        <Text style={font.caption}>Loading your dishes…</Text>
      ) : available.length === 0 ? (
        <Text style={font.caption}>
          {dishes?.length
            ? 'All your dishes are on this menu. Add a new one below.'
            : 'You have no dishes yet. Add one below; it’s saved for future menus too.'}
        </Text>
      ) : (
        available.map((dish) => {
          const selected = chosen.includes(dish.id);
          return (
            <Pressable
              key={dish.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={dish.name}
              onPress={() => toggle(dish.id)}
              style={styles.pickRow}
            >
              <View style={[styles.check, selected && styles.checked]}>
                {selected && <Text style={styles.tick}>✓</Text>}
              </View>
              <View style={styles.itemText}>
                <Text style={font.body}>{dish.name}</Text>
                <Text style={font.caption}>{dishSummary(dish)}</Text>
              </View>
            </Pressable>
          );
        })
      )}
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
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { backgroundColor: colors.brand, borderColor: colors.brand },
  tick: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
