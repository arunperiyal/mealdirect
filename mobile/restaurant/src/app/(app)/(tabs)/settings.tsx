import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Chip, colors, font, formatINR, spacing } from '@mealdirect/shared';
import { LinkRow } from '@/components/LinkRow';
import { useRestaurant } from '@/lib/useRestaurant';
import { useAppDispatch, useAppSelector } from '@/store';
import { logout } from '@/store/authSlice';
import { selectRestaurant } from '@/store/restaurantSlice';
import { useGetMyRestaurantsQuery } from '@/store/serverApi';

export default function SettingsScreen() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const restaurant = useRestaurant();
  const { data: restaurants = [] } = useGetMyRestaurantsQuery();
  const [signingOut, setSigningOut] = useState(false);

  const modes = [restaurant.deliveryEnabled && 'Delivery', restaurant.pickupEnabled && 'Pickup'].filter(Boolean);
  const fee = Number(restaurant.defaultDeliveryFee ?? 0);
  const payout = restaurant.upiId || (restaurant.bankAccountNumber ? `Account ending ${restaurant.bankAccountNumber.slice(-4)}` : '');

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
      <Card title={restaurant.name}>
        <Text style={font.caption}>{[restaurant.address, restaurant.city].filter(Boolean).join(', ')}</Text>
        <LinkRow title="Restaurant details" detail="Name, phone, address" onPress={() => router.push('/settings/profile')} />
        <LinkRow
          title="Delivery & pickup"
          detail={
            modes.length
              ? `${modes.join(' & ')}${restaurant.deliveryEnabled ? ` · ${fee > 0 ? `${formatINR(fee)} fee` : 'free delivery'}` : ''}`
              : 'Not taking orders'
          }
          onPress={() => router.push('/settings/delivery')}
        />
        <LinkRow title="Payout details" detail={payout || 'Not set up'} onPress={() => router.push('/settings/bank')} />
      </Card>

      {restaurants.length > 1 && (
        <Card title="Your restaurants">
          <View style={styles.chips} accessibilityRole="radiogroup">
            {restaurants.map((r) => (
              <Chip
                key={r.id}
                label={r.isApproved ? r.name : `${r.name} (pending)`}
                selected={r.id === restaurant.id}
                onPress={() => dispatch(selectRestaurant(r.id))}
              />
            ))}
          </View>
        </Card>
      )}

      <Card title="Account">
        <Text style={font.body}>{[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Restaurant partner'}</Text>
        <Text style={font.caption}>{user?.email}</Text>
      </Card>

      <Button title="Sign out" variant="danger" onPress={confirmSignOut} loading={signingOut} />
      <Text style={[font.caption, styles.version]}>MealDirect Partner</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  version: { textAlign: 'center', marginTop: spacing.lg, color: colors.textMuted },
});
