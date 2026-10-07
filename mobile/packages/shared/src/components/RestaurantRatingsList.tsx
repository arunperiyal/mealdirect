import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { RestaurantRatings } from '../api/types';
import { formatDateTime } from '../lib/dates';
import { colors, font, radius, spacing } from '../theme';
import { EmptyState } from './States';
import { Stars } from './Stars';

interface Props {
  ratings: RestaurantRatings;
  refreshing: boolean;
  onRefresh: () => void;
}

// A restaurant's food ratings: the average, how many of each star, and recent comments
export function RestaurantRatingsList({ ratings, refreshing, onRefresh }: Props) {
  return (
    <FlatList
      data={ratings.recent}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      ListHeaderComponent={<Summary ratings={ratings} />}
      ListEmptyComponent={<EmptyState title={ratings.count ? 'No comments yet' : 'No ratings yet'} />}
      renderItem={({ item }) => (
        <View style={styles.review}>
          <View style={styles.reviewTop}>
            <Stars value={item.rating} label={`${item.name}'s rating`} size={14} />
            <Text style={font.caption}>
              {item.name} · {formatDateTime(item.createdAt)}
            </Text>
          </View>
          <Text style={font.body}>{item.comment}</Text>
        </View>
      )}
    />
  );
}

function Summary({ ratings }: { ratings: RestaurantRatings }) {
  const most = Math.max(1, ...Object.values(ratings.byStars));
  return (
    <View style={styles.summary}>
      <View style={styles.average}>
        <Text style={styles.big}>{ratings.average?.toFixed(1) ?? '–'}</Text>
        <Stars value={ratings.average} label="Average" />
        <Text style={font.caption}>
          {ratings.count} rating{ratings.count === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.bars}>
        {([5, 4, 3, 2, 1] as const).map((n) => (
          <View key={n} style={styles.barRow} accessibilityLabel={`${n} stars: ${ratings.byStars[n]}`}>
            <Text style={[font.caption, styles.barLabel]}>{n}★</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(ratings.byStars[n] / most) * 100}%` }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  summary: {
    flexDirection: 'row',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  average: { alignItems: 'center', gap: spacing.xs },
  big: { fontSize: 36, fontWeight: '700', color: colors.text },
  bars: { flex: 1, justifyContent: 'center', gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barLabel: { width: 24 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.background, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#F5A623' },
  review: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, gap: spacing.xs },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
