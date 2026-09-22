import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useAppDispatch, useAppSelector } from '@/store';
import { logout } from '@/store/authSlice';
import { colors, font, spacing } from '@/theme';

export default function ProfileScreen() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [signingOut, setSigningOut] = useState(false);

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'MealDirect customer';
  const initials = name
    .split(' ')
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'Your cart will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await dispatch(logout());
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{initials}</Text>
        </View>
        <Text style={font.title}>{name}</Text>
        {user?.email && <Text style={font.caption}>{user.email}</Text>}
      </View>

      <Card>
        <Button title="Order history" variant="secondary" onPress={() => router.navigate('/orders')} />
      </Card>

      <Button title="Sign out" variant="danger" onPress={confirmSignOut} loading={signingOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  header: { alignItems: 'center', gap: spacing.xs, marginVertical: spacing.xl },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  initials: { color: colors.brand, fontSize: 26, fontWeight: '700' },
});
