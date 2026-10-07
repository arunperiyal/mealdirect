import { errorMessage, ErrorState, LoadingState, RestaurantRatingsList } from '@mealdirect/shared';
import { useRestaurant } from '@/lib/useRestaurant';
import { useGetRatingsQuery } from '@/store/serverApi';

// The selected restaurant's food ratings, as customers see them
export default function RatingsScreen() {
  const restaurant = useRestaurant();
  const { data, error, isLoading, isFetching, refetch } = useGetRatingsQuery(restaurant.id, {
    refetchOnMountOrArgChange: true,
  });

  if (isLoading) return <LoadingState />;
  if (!data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;
  return <RestaurantRatingsList ratings={data} refreshing={isFetching && !isLoading} onRefresh={refetch} />;
}
