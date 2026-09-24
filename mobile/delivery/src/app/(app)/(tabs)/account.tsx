import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import {
  Button,
  Card,
  colors,
  confirmAction,
  font,
  LinkRow,
  maskAccount,
  spacing,
  type ChangeRequest,
} from '@mealdirect/shared';
import { useAppDispatch, useAppSelector } from '@/store';
import { logout } from '@/store/authSlice';
import { useGetProfileQuery } from '@/store/serverApi';

// "Change waiting for review" etc., else the saved value
const withStatus = (request: ChangeRequest | null | undefined, saved: string) =>
  request?.status === 'pending'
    ? 'Change waiting for review'
    : request?.status === 'rejected'
      ? 'Change not approved, tap to see why'
      : saved;

export default function AccountScreen() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  // Details change only after an admin approves, so refetch when the screen opens
  const { data: profile, isFetching, refetch } = useGetProfileQuery(undefined, { refetchOnMountOrArgChange: true });
  const [signingOut, setSigningOut] = useState(false);
  const me = profile ?? user;

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

  const payout = profile ? [profile.upiId, maskAccount(profile.bankAccountNumber)].filter(Boolean).join(' · ') : '';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isFetching && !!profile} onRefresh={refetch} tintColor={colors.brand} />}
    >
      <Card title="Delivery partner">
        <Text style={font.body}>{[me?.firstName, me?.lastName].filter(Boolean).join(' ')}</Text>
        <Text style={font.caption}>{me?.phone}</Text>
        <Text style={font.caption}>{me?.email}</Text>
        <LinkRow
          title="Personal details"
          detail={withStatus(profile?.changeRequests.personal, 'Name and phone')}
          onPress={() => router.push('/profile/personal')}
        />
        <LinkRow
          title="Payout details"
          detail={withStatus(profile?.changeRequests.payout, payout || 'Add your UPI ID and bank account')}
          onPress={() => router.push('/profile/payout')}
        />
      </Card>
      <Text style={[font.caption, styles.note]}>
        Restaurants and customers see your name and phone number on orders you accept. MealDirect pays tips and
        earnings to your payout details.
      </Text>
      <Button title="Sign out" variant="danger" onPress={confirmSignOut} loading={signingOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  note: { marginBottom: spacing.lg },
});
