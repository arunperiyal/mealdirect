import { Stack } from 'expo-router';
import { colors, errorMessage, ErrorState, LoadingState } from '@mealdirect/shared';
import { useAppSelector } from '@/store';
import { useGetMyRestaurantsQuery } from '@/store/serverApi';

// Gate: no restaurant -> setup; not yet approved -> pending; approved -> the app
export default function AppLayout() {
  const selectedId = useAppSelector((s) => s.restaurant.selectedId);
  const { data, error, isLoading, refetch } = useGetMyRestaurantsQuery();

  if (isLoading) return <LoadingState />;
  if (error && !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const restaurant = data?.find((r) => r.id === selectedId) ?? data?.[0];
  const hasRestaurant = Boolean(restaurant);
  const approved = Boolean(restaurant?.isApproved);

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.brand,
        headerTitleStyle: { color: colors.text },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={!hasRestaurant}>
        <Stack.Screen name="setup" options={{ title: 'Add your restaurant' }} />
      </Stack.Protected>

      <Stack.Protected guard={hasRestaurant && !approved}>
        <Stack.Screen name="pending" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={approved}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
        <Stack.Screen name="menu/new" options={{ title: 'New menu', presentation: 'modal' }} />
        <Stack.Screen name="menu/[id]" options={{ title: 'Menu' }} />
        <Stack.Screen name="dishes" options={{ title: 'My dishes' }} />
      </Stack.Protected>

      {/* Details can be edited while waiting for approval too */}
      <Stack.Protected guard={hasRestaurant}>
        <Stack.Screen name="settings/profile" options={{ title: 'Restaurant details' }} />
        <Stack.Screen name="settings/delivery" options={{ title: 'Delivery & pickup' }} />
        <Stack.Screen name="settings/bank" options={{ title: 'Payout details' }} />
        <Stack.Screen name="settings/orders" options={{ title: 'Order handling' }} />
      </Stack.Protected>
    </Stack>
  );
}
