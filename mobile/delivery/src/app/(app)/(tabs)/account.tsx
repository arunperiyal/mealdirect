import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  Button,
  Card,
  colors,
  confirmAction,
  DeleteAccount,
  font,
  LinkRow,
  maskAccount,
  ProfilePhoto,
  Stars,
  spacing,
  type ChangeRequest,
} from '@mealdirect/shared';
import { authApi } from '@/api';
import { API_URL } from '@/config';
import { useAppDispatch, useAppSelector } from '@/store';
import { logout, signOutLocally, userUpdated } from '@/store/authSlice';
import { useGetProfileQuery, useGetRatingsQuery, useGetRulesQuery } from '@/store/serverApi';

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
  const { data: ratings } = useGetRatingsQuery(undefined, { refetchOnMountOrArgChange: true });
  const { data: rules = [] } = useGetRulesQuery();
  const activeRules = rules.filter((r) => r.enabled).length;
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
        {user && (
          <ProfilePhoto
            user={user}
            baseUrl={API_URL}
            setAvatar={authApi.setAvatar}
            removeAvatar={authApi.removeAvatar}
            onChange={(u) => dispatch(userUpdated(u))}
          />
        )}
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
        <LinkRow
          title="Auto-accept"
          detail={activeRules ? `${activeRules} rule${activeRules === 1 ? '' : 's'} on` : 'Take a restaurant’s deliveries automatically'}
          onPress={() => router.push('/auto-accept')}
        />
        <LinkRow title="Delivery statement" detail="Download your deliveries as a CSV file" onPress={() => router.push('/statement')} />
      </Card>
      <Card title="Your rating">
        {ratings?.count ? (
          <>
            <View style={styles.average}>
              <Stars value={ratings.average} label="Your average rating" />
              <Text style={font.body}>
                {ratings.average?.toFixed(1)} from {ratings.count} deliver{ratings.count === 1 ? 'y' : 'ies'}
              </Text>
            </View>
            {ratings.recent
              .filter((r) => r.comment)
              .slice(0, 5)
              .map((r) => (
                <View key={r.id} style={styles.comment}>
                  <Stars value={r.rating} size={12} label="Rating" />
                  <Text style={font.caption}>“{r.comment}”</Text>
                </View>
              ))}
          </>
        ) : (
          <Text style={font.caption}>Customers can rate each delivery. Their ratings show here.</Text>
        )}
      </Card>
      <Text style={[font.caption, styles.note]}>
        Restaurants and customers see your name and phone number on orders you accept. MealDirect pays tips and
        earnings to your payout details.
      </Text>
      <Button title="Sign out" variant="danger" onPress={confirmSignOut} loading={signingOut} />
      <DeleteAccount deleteAccount={authApi.deleteAccount} onDeleted={() => dispatch(signOutLocally())} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  note: { marginBottom: spacing.lg },
  average: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  comment: { gap: 2, marginTop: spacing.sm },
});
