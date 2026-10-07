import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, confirmAction, DeleteAccount, font, ProfilePhoto, spacing } from '@mealdirect/shared';
import { authApi } from '@/api';
import { API_URL } from '@/config';
import { useAppDispatch, useAppSelector } from '@/store';
import { logout, signOutLocally, userUpdated } from '@/store/authSlice';

export default function ProfileScreen() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [signingOut, setSigningOut] = useState(false);

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'MealDirect customer';

  const confirmSignOut = () =>
    confirmAction({
      title: 'Sign out?',
      message: 'Your cart will be cleared.',
      confirmText: 'Sign out',
      destructive: true,
      onConfirm: async () => {
        setSigningOut(true);
        await dispatch(logout());
      },
    });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {user && (
          <ProfilePhoto
            user={user}
            baseUrl={API_URL}
            setAvatar={authApi.setAvatar}
            removeAvatar={authApi.removeAvatar}
            onChange={(u) => dispatch(userUpdated(u))}
          />
        )}
        <Text style={font.title}>{name}</Text>
        {user?.email && <Text style={font.caption}>{user.email}</Text>}
      </View>

      <Card>
        <Button title="Order history" variant="secondary" onPress={() => router.navigate('/orders')} />
      </Card>

      <Button title="Sign out" variant="danger" onPress={confirmSignOut} loading={signingOut} />
      <DeleteAccount deleteAccount={authApi.deleteAccount} onDeleted={() => dispatch(signOutLocally())} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  header: { alignItems: 'center', gap: spacing.xs, marginVertical: spacing.xl },
});
