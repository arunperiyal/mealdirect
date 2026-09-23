import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button, colors, font, spacing } from '@mealdirect/shared';
import { useAppDispatch, useAppSelector } from '@/store';
import { logout, refreshProfile } from '@/store/authSlice';

const CHECK_EVERY_MS = 30000;

export default function PendingScreen() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [checking, setChecking] = useState(false);
  const suspended = user?.riderStatus === 'suspended';

  // Re-check approval periodically; the layout opens the app once approved
  useEffect(() => {
    const id = setInterval(() => dispatch(refreshProfile()), CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [dispatch]);

  const checkNow = async () => {
    setChecking(true);
    await dispatch(refreshProfile());
    setChecking(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.brand}>MealDirect Delivery</Text>
        <Text style={font.title}>{suspended ? 'Account suspended' : 'Waiting for approval'}</Text>
        <Text style={[font.body, styles.text]}>
          {suspended
            ? 'You can’t take deliveries right now. Contact MealDirect support to find out more.'
            : `Thanks for signing up, ${user?.firstName ?? 'there'}. Our team reviews new delivery partners, usually within a day. You can start taking orders as soon as you’re approved.`}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title="Check again" onPress={checkNow} loading={checking} />
        {!suspended && (
          <>
            <Button title="Add payout details" variant="secondary" onPress={() => router.push('/profile/payout')} />
            <Button title="Edit personal details" variant="secondary" onPress={() => router.push('/profile/personal')} />
          </>
        )}
        <Button title="Sign out" variant="danger" onPress={() => dispatch(logout())} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  body: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  brand: { color: colors.brand, fontSize: 22, fontWeight: '800' },
  text: { lineHeight: 22 },
  actions: { padding: spacing.xl, gap: spacing.md },
});
