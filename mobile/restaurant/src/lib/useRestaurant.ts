import type { OwnedRestaurant } from '@mealdirect/shared';
import { useAppSelector } from '@/store';
import { useGetMyRestaurantsQuery } from '@/store/serverApi';

// The restaurant the app is working with. Screens under the approval gate can rely on it.
export function useRestaurant(): OwnedRestaurant {
  const selectedId = useAppSelector((s) => s.restaurant.selectedId);
  const { data = [] } = useGetMyRestaurantsQuery();
  const restaurant = data.find((r) => r.id === selectedId) ?? data[0];
  if (!restaurant) throw new Error('useRestaurant used before a restaurant exists');
  return restaurant;
}
