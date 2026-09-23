import { Stack } from 'expo-router';
import { colors } from '@mealdirect/shared';
import { useAppSelector } from '@/store';

// Gate: riders see orders only once an admin has approved them
export default function AppLayout() {
  const approved = useAppSelector((s) => s.auth.user?.riderStatus === 'approved');

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.brand,
        headerTitleStyle: { color: colors.text },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={!approved}>
        <Stack.Screen name="pending" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={approved}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="delivery/[id]" options={{ title: 'Delivery' }} />
      </Stack.Protected>
    </Stack>
  );
}
