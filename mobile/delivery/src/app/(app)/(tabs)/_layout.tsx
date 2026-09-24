import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, webTabBarOptions } from '@mealdirect/shared';
import { isActiveDelivery } from '@/lib/riderSteps';
import { useGetMyDeliveriesQuery } from '@/store/serverApi';

export default function TabsLayout() {
  const { data = [] } = useGetMyDeliveriesQuery();
  const active = data.filter(isActiveDelivery).length;

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
          title: 'Available',
          headerTitle: 'Available deliveries',
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'tray.full', android: 'inbox', web: 'inbox' }} tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{
          title: 'My deliveries',
          tabBarBadge: active > 0 ? active : undefined,
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'bicycle', android: 'pedal_bike', web: 'pedal_bike' }} tintColor={color} size={size} />
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
