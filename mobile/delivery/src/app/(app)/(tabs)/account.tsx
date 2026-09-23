import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, font, spacing } from '@mealdirect/shared';
import { useAppDispatch, useAppSelector } from '@/store';
import { logout } from '@/store/authSlice';

export default function AccountScreen() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [signingOut, setSigningOut] = useState(false);

  const confirmSignOut = () =>
    Alert.alert('Sign out?', undefined, [
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
      <Card title="Delivery partner">
        <Text style={font.body}>{[user?.firstName, user?.lastName].filter(Boolean).join(' ')}</Text>
        <Text style={font.caption}>{user?.phone}</Text>
        <Text style={font.caption}>{user?.email}</Text>
      </Card>
      <Text style={[font.caption, styles.note]}>
        Restaurants and customers see your name and phone number on orders you accept.
      </Text>
      <Button title="Sign out" variant="danger" onPress={confirmSignOut} loading={signingOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  note: { marginBottom: spacing.lg },
});
