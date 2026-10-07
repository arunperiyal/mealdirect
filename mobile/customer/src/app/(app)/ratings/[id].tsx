import { Stack, useLocalSearchParams } from 'expo-router';
import { errorMessage, ErrorState, LoadingState, RestaurantRatingsList } from '@mealdirect/shared';
import { useGetRestaurantQuery, useGetRestaurantRatingsQuery } from '@/store/serverApi';

export default function RatingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: restaurant } = useGetRestaurantQuery(id);
  const { data, error, isLoading, isFetching, refetch } = useGetRestaurantRatingsQuery(id);

  return (
    <>
      <Stack.Screen options={{ title: restaurant ? `${restaurant.name} ratings` : 'Ratings' }} />
      {isLoading ? (
        <LoadingState />
      ) : !data ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : (
        <RestaurantRatingsList ratings={data} refreshing={isFetching && !isLoading} onRefresh={refetch} />
      )}
    </>
  );
}
