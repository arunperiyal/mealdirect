import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, webTabBarOptions } from '@mealdirect/shared';
import { needsAttention } from '@/lib/orderActions';
import { useRestaurant } from '@/lib/useRestaurant';
import { useGetRestaurantOrdersQuery } from '@/store/serverApi';

export default function TabsLayout() {
  const restaurant = useRestaurant();
  const { data: orders = [] } = useGetRestaurantOrdersQuery({ restaurantId: restaurant.id });
  const newOrders = orders.filter(needsAttention).length;

  return (
    <Tabs
      screenOptions={{
        ...webTabBarOptions,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          headerTitle: restaurant.name,
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'house', android: 'home', web: 'home' }} tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarBadge: newOrders > 0 ? newOrders : undefined,
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'list.bullet.rectangle', android: 'receipt_long', web: 'receipt_long' }} tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="kitchen"
        options={{
          title: 'Kitchen',
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'frying.pan', android: 'skillet', web: 'skillet' }} tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="menus"
        options={{
          title: 'Menus',
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'menucard', android: 'restaurant_menu', web: 'restaurant_menu' }} tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} tintColor={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
