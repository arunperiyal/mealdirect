import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  addDays,
  Button,
  Chip,
  colors,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  formatINR,
  formatTime,
  LoadingState,
  localDateString,
  radius,
  spacing,
  type Menu,
  type MenuItem,
  type Restaurant,
} from '@mealdirect/shared';
import { CartBar } from '@/components/CartBar';
import { QuantityStepper } from '@/components/QuantityStepper';
import { useAppDispatch, useAppSelector } from '@/store';
import { addItem, decrementItem, MAX_ITEM_QUANTITY } from '@/store/cartSlice';
import { useGetPublishedMenusQuery, useGetRestaurantQuery } from '@/store/serverApi';

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
          menu ? <MenuItemRow item={item} menu={menu} restaurant={restaurant} /> : null
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

      {menu?.orderingStartTime && menu?.orderingEndTime ? (
        <Text style={[font.caption, styles.window]}>
          Ordering open {formatTime(menu.orderingStartTime)} – {formatTime(menu.orderingEndTime)}
        </Text>
      ) : null}
    </View>
  );
}

function MenuItemRow({ item, menu, restaurant }: { item: MenuItem; menu: Menu; restaurant: Restaurant }) {
  const dispatch = useAppDispatch();
  const cart = useAppSelector((s) => s.cart);
  const quantity =
    cart.menuId === menu.id ? cart.lines.find((l) => l.menuItemId === item.id)?.quantity ?? 0 : 0;

  const add = () => {
    const payload = {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      menuId: menu.id,
      menuDate: menu.date,
      item,
    };
    if (cart.menuId && cart.menuId !== menu.id) {
      const sameRestaurant = cart.restaurantId === restaurant.id;
      Alert.alert(
        'Start a new cart?',
        sameRestaurant
          ? `Your cart has items from a different day's menu. An order can only include one menu.`
          : `Your cart has items from ${cart.restaurantName}. Adding this will clear it.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Start new cart', style: 'destructive', onPress: () => dispatch(addItem(payload)) },
        ]
      );
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
      </View>
      {!item.available ? (
        <Text style={styles.soldOut}>Sold out</Text>
      ) : quantity > 0 ? (
        <QuantityStepper
          label={item.name}
          quantity={quantity}
          max={MAX_ITEM_QUANTITY}
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
  addButton: { minHeight: 38, minWidth: 84 },
});
