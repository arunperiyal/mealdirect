import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  addDays,
  Button,
  Chip,
  colors,
  confirmAction,
  dishAllowance,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  formatINR,
  LoadingState,
  localDateString,
  orderedFromMenu,
  orderingState,
  radius,
  spacing,
  type Menu,
  type MenuItem,
  type Restaurant,
} from '@mealdirect/shared';
import { CartBar } from '@/components/CartBar';
import { QuantityStepper } from '@/components/QuantityStepper';
import { useAppDispatch, useAppSelector } from '@/store';
import { addItem, decrementItem } from '@/store/cartSlice';
import { useGetMyOrdersQuery, useGetPublishedMenusQuery, useGetRestaurantQuery } from '@/store/serverApi';

const DAYS = [
  { label: 'Today', offset: 0 },
  { label: 'Tomorrow', offset: 1 },
];

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [dayIndex, setDayIndex] = useState(0);
  const date = useMemo(() => localDateString(addDays(new Date(), DAYS[dayIndex].offset)), [dayIndex]);

  const restaurantQuery = useGetRestaurantQuery(id);
  const menusQuery = useGetPublishedMenusQuery({ restaurantId: id, date });
  const restaurant = restaurantQuery.data;
  const menu = menusQuery.data?.[0];
  // What this customer already ordered from the menu counts toward daily limits
  const { data: myOrders } = useGetMyOrdersQuery();
  const ordered = useMemo(() => (menu ? orderedFromMenu(myOrders ?? [], menu.id) : new Map<string, number>()), [myOrders, menu]);

  if (restaurantQuery.isLoading) return <LoadingState />;
  if (!restaurant) {
    return (
      <ErrorState
        message={errorMessage(restaurantQuery.error, 'Restaurant not found')}
        onRetry={restaurantQuery.refetch}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: restaurant.name }} />
      <FlatList
        data={menu?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Header
            restaurant={restaurant}
            menu={menu}
            dayIndex={dayIndex}
            onSelectDay={setDayIndex}
          />
        }
        renderItem={({ item }) =>
          menu ? (
            <MenuItemRow item={item} menu={menu} restaurant={restaurant} orderedBefore={ordered.get(item.id) ?? 0} />
          ) : null
        }
        ListEmptyComponent={
          menusQuery.isFetching ? (
            <LoadingState />
          ) : menusQuery.error ? (
            <ErrorState message={errorMessage(menusQuery.error)} onRetry={menusQuery.refetch} />
          ) : (
            <EmptyState
              title={`No menu ${DAYS[dayIndex].label.toLowerCase()}`}
              message={
                dayIndex === 0
                  ? "This kitchen hasn't published today's menu. Check tomorrow's."
                  : "Tomorrow's menu isn't out yet. Check back later."
              }
            />
          )
        }
      />
      <CartBar />
    </View>
  );
}

function Header({
  restaurant,
  menu,
  dayIndex,
  onSelectDay,
}: {
  restaurant: Restaurant;
  menu: Menu | undefined;
  dayIndex: number;
  onSelectDay: (i: number) => void;
}) {
  const modes = [restaurant.deliveryEnabled && 'Delivery', restaurant.pickupEnabled && 'Pickup']
    .filter(Boolean)
    .join(' & ');
  return (
    <View style={styles.header}>
      {restaurant.description ? <Text style={font.body}>{restaurant.description}</Text> : null}
      <Text style={font.caption}>
        {[restaurant.address, restaurant.city].filter(Boolean).join(', ')}
      </Text>
      {modes ? <Text style={font.caption}>{modes} available</Text> : null}

      <View style={styles.days} accessibilityRole="radiogroup">
        {DAYS.map((d, i) => (
          <Chip key={d.label} label={d.label} selected={i === dayIndex} onPress={() => onSelectDay(i)} />
        ))}
      </View>

      {menu ? <CutoffNote menu={menu} /> : null}
    </View>
  );
}

function CutoffNote({ menu }: { menu: Menu }) {
  const { open, label } = orderingState(menu, localDateString(new Date()));
  if (!label) return null;
  return <Text style={[font.caption, styles.window, !open && styles.closed]}>{label}</Text>;
}

function MenuItemRow({
  item,
  menu,
  restaurant,
  orderedBefore,
}: {
  item: MenuItem;
  menu: Menu;
  restaurant: Restaurant;
  orderedBefore: number;
}) {
  const dispatch = useAppDispatch();
  const cart = useAppSelector((s) => s.cart);
  const quantity =
    cart.menuId === menu.id ? cart.lines.find((l) => l.menuItemId === item.id)?.quantity ?? 0 : 0;
  const allowance = dishAllowance(item, orderedBefore);

  const add = () => {
    const payload = {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      menuId: menu.id,
      menuDate: menu.date,
      item,
      maxQuantity: allowance.max,
    };
    if (cart.menuId && cart.menuId !== menu.id) {
      const sameRestaurant = cart.restaurantId === restaurant.id;
      confirmAction({
        title: 'Start a new cart?',
        message: sameRestaurant
          ? `Your cart has items from a different day's menu. An order can only include one menu.`
          : `Your cart has items from ${cart.restaurantName}. Adding this will clear it.`,
        confirmText: 'Start new cart',
        destructive: true,
        onConfirm: () => dispatch(addItem(payload)),
      });
      return;
    }
    dispatch(addItem(payload));
  };

  return (
    <View style={[styles.item, !item.available && styles.unavailable]}>
      <View style={styles.itemText}>
        <Text style={font.heading}>{item.name}</Text>
        <Text style={styles.price}>{formatINR(item.price)}</Text>
        {item.description ? (
          <Text style={font.caption} numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}
        {allowance.note && item.available ? <Text style={styles.limit}>{allowance.note}</Text> : null}
      </View>
      {!item.available ? (
        <Text style={styles.soldOut}>Sold out</Text>
      ) : !orderingState(menu, localDateString(new Date())).open ? (
        <Text style={styles.soldOut}>Closed</Text>
      ) : quantity === 0 && allowance.max === 0 ? (
        <Text style={styles.soldOut}>Limit reached</Text>
      ) : quantity > 0 ? (
        <QuantityStepper
          label={item.name}
          quantity={quantity}
          max={allowance.max}
          onIncrement={add}
          onDecrement={() => dispatch(decrementItem(item.id))}
        />
      ) : (
        <Button title="Add" variant="secondary" onPress={add} style={styles.addButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.lg, flexGrow: 1 },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  days: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  window: { marginTop: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  unavailable: { opacity: 0.55 },
  itemText: { flex: 1, gap: 2 },
  price: { fontSize: 15, fontWeight: '600', color: colors.text },
  soldOut: { color: colors.textMuted, fontWeight: '600' },
  limit: { fontSize: 12, color: colors.warning, fontWeight: '600' },
  closed: { color: colors.danger, fontWeight: '600' },
  addButton: { minHeight: 38, minWidth: 84 },
});
