import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, webTabBarOptions } from '@mealdirect/shared';
import { useGetRestaurantsQuery, useGetRidersQuery } from '@/store/serverApi';

export default function TabsLayout() {
  // Pending count for the tab badge
  const { data } = useGetRestaurantsQuery({ status: 'pending' });
  const pending = data?.counts.pending ?? 0;
  const { data: riders } = useGetRidersQuery({ status: 'pending' });
  const pendingRiders = riders?.counts.pending ?? 0;

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
          title: 'Overview',
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' }} tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="restaurants"
        options={{
          title: 'Restaurants',
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'storefront', android: 'storefront', web: 'storefront' }} tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="riders"
        options={{
          title: 'Riders',
          tabBarBadge: pendingRiders > 0 ? pendingRiders : undefined,
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'bicycle', android: 'pedal_bike', web: 'pedal_bike' }} tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'list.bullet.rectangle', android: 'receipt_long', web: 'receipt_long' }} tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }} tintColor={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
