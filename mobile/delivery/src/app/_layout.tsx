import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { LoadingState, WebFrame } from '@mealdirect/shared';
import { store, useAppDispatch, useAppSelector } from '@/store';
import { bootstrapSession, refreshProfile } from '@/store/authSlice';

function RootNavigator() {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.auth.status);
  // A new account confirms its email before the app opens (older cached profiles have no flag)
  const unverified = useAppSelector((s) => s.auth.user?.isVerified === false);

  useEffect(() => {
    dispatch(bootstrapSession())
      .unwrap()
      .then((user) => {
        if (user) dispatch(refreshProfile());
      })
      .catch(() => {});
  }, [dispatch]);

  if (status === 'loading') return <LoadingState />;

  const signedIn = status === 'signedIn';
  const verified = signedIn && !unverified;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={verified}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && unverified}>
        <Stack.Screen name="verify-email" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="register" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <StatusBar style="dark" />
      <WebFrame maxWidth={600}>
        <RootNavigator />
      </WebFrame>
    </Provider>
  );
}
