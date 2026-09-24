import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, confirmAction, font, LinkRow, spacing } from '@mealdirect/shared';
import { useAppDispatch, useAppSelector } from '@/store';
import { logout } from '@/store/authSlice';

export default function AccountScreen() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [signingOut, setSigningOut] = useState(false);

  const confirmSignOut = () =>
    confirmAction({
      title: 'Sign out?',
      confirmText: 'Sign out',
      destructive: true,
      onConfirm: async () => {
        setSigningOut(true);
        await dispatch(logout());
      },
    });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card title="Signed in as">
        <Text style={font.body}>{[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Admin'}</Text>
        <Text style={font.caption}>{user?.email}</Text>
      </Card>
      <Card title="Users">
        <LinkRow
          title="Customers, partners and riders"
          detail="Find a user, change their email"
          onPress={() => router.push('/users')}
        />
      </Card>
      <Button title="Sign out" variant="danger" onPress={confirmSignOut} loading={signingOut} />
      <Text style={[font.caption, styles.note]}>
        New admin accounts are created on the server with npm run create-admin.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  note: { textAlign: 'center', marginTop: spacing.lg },
});
