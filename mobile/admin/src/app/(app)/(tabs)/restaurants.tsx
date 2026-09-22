import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import {
  Chip,
  colors,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  formatDateTime,
  LoadingState,
  radius,
  spacing,
  useDebounced,
  type AdminRestaurant,
  type VerificationStatus,
} from '@mealdirect/shared';
import { ReviewPill } from '@/components/ReviewPill';
import { useGetRestaurantsQuery } from '@/store/serverApi';

const FILTERS: { status: VerificationStatus; label: string }[] = [
  { status: 'pending', label: 'Waiting' },
  { status: 'verified', label: 'Live' },
  { status: 'rejected', label: 'Rejected' },
];

export default function RestaurantsScreen() {
  const [status, setStatus] = useState<VerificationStatus>('pending');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const { data, error, isLoading, isFetching, refetch } = useGetRestaurantsQuery({
    status,
    search: debounced || undefined,
  });

  return (
    <View style={styles.flex}>
      <View style={styles.controls}>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {FILTERS.map((f) => (
            <Chip
              key={f.status}
              label={data ? `${f.label} (${data.counts[f.status]})` : f.label}
              selected={status === f.status}
              onPress={() => setStatus(f.status)}
            />
          ))}
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search restaurants"
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={styles.search}
        />
      </View>

      {isLoading ? (
        <LoadingState />
      ) : error && !data ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : (
        <FlatList
          data={data?.restaurants ?? []}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <RestaurantRow restaurant={item} />}
          contentContainerStyle={styles.list}
          style={isFetching ? styles.dimmed : undefined}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />
          }
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <EmptyState
              title={debounced ? 'No matches' : status === 'pending' ? 'Nothing to review' : 'None yet'}
              message={status === 'pending' && !debounced ? 'New restaurants show up here for approval.' : undefined}
            />
          }
        />
      )}
    </View>
  );
}

function RestaurantRow({ restaurant }: { restaurant: AdminRestaurant }) {
  const owner = [restaurant.owner?.firstName, restaurant.owner?.lastName].filter(Boolean).join(' ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: restaurant.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.rowTop}>
        <Text style={[font.heading, styles.flex]} numberOfLines={1}>
          {restaurant.name}
        </Text>
        <ReviewPill status={restaurant.verificationStatus} />
      </View>
      <Text style={font.caption} numberOfLines={1}>
        {[restaurant.city, owner || restaurant.owner?.email].filter(Boolean).join(' · ')}
      </Text>
      <Text style={font.caption}>
        {restaurant.verificationStatus === 'verified' && restaurant.approvedAt
          ? `Live since ${formatDateTime(restaurant.approvedAt)}`
          : `Added ${formatDateTime(restaurant.createdAt)}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  controls: { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  search: {
    minHeight: 44,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  list: { padding: spacing.lg, paddingTop: spacing.sm, flexGrow: 1 },
  dimmed: { opacity: 0.6 },
  row: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
