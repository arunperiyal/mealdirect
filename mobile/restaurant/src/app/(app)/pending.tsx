import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button, colors, font, spacing } from '@mealdirect/shared';
import { useAppDispatch } from '@/store';
import { logout } from '@/store/authSlice';
import { useRestaurant } from '@/lib/useRestaurant';
import { useGetMyRestaurantsQuery } from '@/store/serverApi';

const CHECK_EVERY_MS = 30000;

export default function PendingScreen() {
  const dispatch = useAppDispatch();
  const restaurant = useRestaurant();
  // Re-check periodically; the layout switches to the app once approved
  const { refetch, isFetching } = useGetMyRestaurantsQuery(undefined, { pollingInterval: CHECK_EVERY_MS });
  const rejected = restaurant.verificationStatus === 'rejected';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.brand}>MealDirect Partner</Text>
        <Text style={font.title}>{rejected ? 'Not approved yet' : 'Waiting for approval'}</Text>
        <Text style={[font.body, styles.text]}>
          {rejected
            ? `${restaurant.name} wasn't approved.`
            : `Thanks for adding ${restaurant.name}. Our team reviews new restaurants, usually within a day. You can set up menus as soon as it's approved.`}
        </Text>
        {rejected && restaurant.verificationNotes ? (
          <View style={styles.notes}>
            <Text style={font.caption}>Reviewer’s note</Text>
            <Text style={font.body}>{restaurant.verificationNotes}</Text>
          </View>
        ) : null}
        {rejected && (
          <Text style={[font.caption, styles.text]}>
            Update your details below, then contact support to request another review.
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        <Button title="Check again" onPress={refetch} loading={isFetching} />
        <Button title="Edit restaurant details" variant="secondary" onPress={() => router.push('/settings/profile')} />
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
  notes: { backgroundColor: colors.background, borderRadius: 10, padding: spacing.md, gap: spacing.xs },
  actions: { padding: spacing.xl, gap: spacing.md },
});
