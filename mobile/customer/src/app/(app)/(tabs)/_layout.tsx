import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors, webTabBarOptions } from '@mealdirect/shared';

export default function TabsLayout() {
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
          title: 'Restaurants',
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'fork.knife', android: 'restaurant', web: 'restaurant' }} tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'bag', android: 'receipt_long', web: 'receipt_long' }} tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }} tintColor={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
