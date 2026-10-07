import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
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
  Stars,
  type Menu,
  type MenuItem,
  type Restaurant,
} from '@mealdirect/shared';
import { CartBar } from '@/components/CartBar';
import { QuantityStepper } from '@/components/QuantityStepper';
import { useAppDispatch, useAppSelector } from '@/store';
import { addItem, decrementItem, selectQuantity } from '@/store/cartSlice';
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
  const menus = useMemo(() => menusQuery.data ?? [], [menusQuery.data]);
  // Several menus a day (Lunch, Dinner...): the one picked, else the first still taking orders
  const [menuId, setMenuId] = useState<string | null>(null);
  const menu =
    menus.find((m) => m.id === menuId) ??
    menus.find((m) => orderingState(m, localDateString(new Date())).open) ??
    menus[0];
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
            menus={menus}
            menu={menu}
            onSelectMenu={setMenuId}
            dayIndex={dayIndex}
            onSelectDay={(i) => {
              setDayIndex(i);
              setMenuId(null);
            }}
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
  menus,
  menu,
  onSelectMenu,
  dayIndex,
  onSelectDay,
}: {
  restaurant: Restaurant;
  menus: Menu[];
  menu: Menu | undefined;
  onSelectMenu: (id: string) => void;
  dayIndex: number;
  onSelectDay: (i: number) => void;
}) {
  const modes = [restaurant.deliveryEnabled && 'Delivery', restaurant.pickupEnabled && 'Pickup']
    .filter(Boolean)
    .join(' & ');
  return (
    <View style={styles.header}>
      {restaurant.description ? <Text style={font.body}>{restaurant.description}</Text> : null}
      {restaurant.totalReviews ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Rated ${Number(restaurant.avgRating).toFixed(1)} from ${restaurant.totalReviews} ratings. See ratings`}
          onPress={() => router.push({ pathname: '/ratings/[id]', params: { id: restaurant.id } })}
          style={styles.ratingRow}
        >
          <Stars value={Number(restaurant.avgRating)} size={16} />
          <Text style={font.caption}>
            {Number(restaurant.avgRating).toFixed(1)} · {restaurant.totalReviews} rating{restaurant.totalReviews === 1 ? '' : 's'} ›
          </Text>
        </Pressable>
      ) : null}
      <Text style={font.caption}>
        {[restaurant.address, restaurant.city].filter(Boolean).join(', ')}
      </Text>
      {modes ? <Text style={font.caption}>{modes} available</Text> : null}

      <View style={styles.days} accessibilityRole="radiogroup">
        {DAYS.map((d, i) => (
          <Chip key={d.label} label={d.label} selected={i === dayIndex} onPress={() => onSelectDay(i)} />
        ))}
      </View>

      {menus.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.menuTabs}
          accessibilityRole="tablist"
        >
          {menus.map((m) => (
            <Chip key={m.id} label={m.name} selected={m.id === menu?.id} onPress={() => onSelectMenu(m.id)} />
          ))}
        </ScrollView>
      )}

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
  const quantity = useAppSelector((s) => selectQuantity(s, menu.id, item.id));
  const allowance = dishAllowance(item, orderedBefore);
  const ordering = orderingState(menu, localDateString(new Date()));

  const add = () => {
    const payload = {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      menuId: menu.id,
      menuName: menu.name,
      menuDate: menu.date,
      item,
      maxQuantity: allowance.max,
    };
    // Any of this restaurant's menus can share the cart; another restaurant starts a new one
    if (cart.restaurantId && cart.restaurantId !== restaurant.id) {
      confirmAction({
        title: 'Start a new cart?',
        message: `Your cart has items from ${cart.restaurantName}. Adding this will clear it.`,
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
      ) : !ordering.open ? (
        <Text style={styles.soldOut}>{ordering.opensLater ? 'Opens later' : 'Closed'}</Text>
      ) : quantity === 0 && allowance.max === 0 ? (
        <Text style={styles.soldOut}>Limit reached</Text>
      ) : quantity > 0 ? (
        <QuantityStepper
          label={item.name}
          quantity={quantity}
          max={allowance.max}
          onIncrement={add}
          onDecrement={() => dispatch(decrementItem({ menuId: menu.id, menuItemId: item.id }))}
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
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  days: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  menuTabs: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
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
