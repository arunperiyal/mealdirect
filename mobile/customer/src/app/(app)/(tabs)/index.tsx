import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CartBar } from '@/components/CartBar';
import { RestaurantCard } from '@/components/RestaurantCard';
import {
  colors,
  EmptyState,
  errorMessage,
  ErrorState,
  LoadingState,
  radius,
  spacing,
  useDebounced,
} from '@mealdirect/shared';
import { useGetRestaurantsQuery } from '@/store/serverApi';

export default function RestaurantsScreen() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search.trim());
  const { data, error, isLoading, isFetching, refetch } = useGetRestaurantsQuery({
    search: debouncedSearch || undefined,
  });

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search restaurants"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search restaurants"
          returnKeyType="search"
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
          data={data ?? []}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <RestaurantCard
              restaurant={item}
              onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: item.id } })}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />
          }
          ListEmptyComponent={
            <EmptyState
              title={debouncedSearch ? 'No matches' : 'No restaurants yet'}
              message={
                debouncedSearch
                  ? `Nothing found for "${debouncedSearch}".`
                  : 'Restaurants near you will appear here once they are approved.'
              }
            />
          }
          keyboardDismissMode="on-drag"
        />
      )}
      <CartBar bottomInset={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
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
});
