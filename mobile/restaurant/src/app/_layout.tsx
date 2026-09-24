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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="register" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <StatusBar style="dark" />
      <WebFrame maxWidth={900}>
        <RootNavigator />
      </WebFrame>
    </Provider>
  );
}
