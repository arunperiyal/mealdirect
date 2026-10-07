import { StyleSheet, Text, View } from 'react-native';
import type { OrderRating } from '../api/types';
import { font, spacing } from '../theme';
import { Stars } from './Stars';

// A customer's rating of an order, as the restaurant, rider or an admin sees it
export function OrderRatingView({ rating, show = 'both' }: { rating: OrderRating; show?: 'both' | 'food' | 'delivery' }) {
  return (
    <View style={styles.container}>
      {show !== 'delivery' && (
        <View style={styles.part}>
          <View style={styles.row}>
            <Text style={[font.body, styles.what]}>Food</Text>
            <Stars value={rating.foodRating} label="Food" />
          </View>
          {rating.foodComment ? <Text style={font.caption}>“{rating.foodComment}”</Text> : null}
        </View>
      )}
      {show !== 'food' && rating.deliveryRating != null && (
        <View style={styles.part}>
          <View style={styles.row}>
            <Text style={[font.body, styles.what]}>Delivery</Text>
            <Stars value={rating.deliveryRating} label="Delivery" />
          </View>
          {rating.deliveryComment ? <Text style={font.caption}>“{rating.deliveryComment}”</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  part: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  what: { width: 72 },
});
