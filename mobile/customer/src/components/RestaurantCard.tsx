import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Restaurant } from '@/api/types';
import { formatINR } from '@/lib/money';
import { colors, font, radius, spacing } from '@/theme';

export function RestaurantCard({ restaurant, onPress }: { restaurant: Restaurant; onPress: () => void }) {
  const rating = Number(restaurant.avgRating ?? 0);
  const fee = Number(restaurant.defaultDeliveryFee ?? 0);
  const modes = [restaurant.deliveryEnabled && 'Delivery', restaurant.pickupEnabled && 'Pickup']
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${restaurant.name}${restaurant.city ? `, ${restaurant.city}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {restaurant.bannerUrl ? (
        <Image source={{ uri: restaurant.bannerUrl }} style={styles.banner} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.banner, styles.placeholder]}>
          <Text style={styles.initial}>{restaurant.name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[font.heading, styles.name]} numberOfLines={1}>
            {restaurant.name}
          </Text>
          {rating > 0 && (
            <View style={styles.rating}>
              <Text style={styles.ratingText}>★ {rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        {restaurant.description ? (
          <Text style={font.caption} numberOfLines={2}>
            {restaurant.description}
          </Text>
        ) : null}
        <Text style={[font.caption, styles.meta]} numberOfLines={1}>
          {[restaurant.city, modes, restaurant.deliveryEnabled && (fee > 0 ? `${formatINR(fee)} delivery` : 'Free delivery')]
            .filter(Boolean)
            .join('  •  ')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  pressed: { opacity: 0.9 },
  banner: { width: '100%', height: 140 },
  placeholder: { backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 48, fontWeight: '800', color: colors.brand },
  body: { padding: spacing.md, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1 },
  rating: { backgroundColor: colors.success, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  ratingText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  meta: { marginTop: 2 },
});
