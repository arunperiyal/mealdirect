import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { localDateString, type Menu, type Order, type Restaurant } from '@mealdirect/shared';
import RestaurantScreen from '@/app/(app)/restaurant/[id]';
import { makeStore } from '@/store';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'r1' }),
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockRestaurant = { id: 'r1', name: 'Amma Mess', deliveryEnabled: true, pickupEnabled: true } as Restaurant;
const mockMenu = {
  id: 'm1',
  restaurantId: 'r1',
  name: 'Lunch',
  date: localDateString(new Date()),
  status: 'published',
  orderingEndTime: null,
  items: [
    { id: 'biryani', name: 'Biryani', price: 200, available: true, maxPerOrder: 2, maxPerDay: 3 },
    { id: 'sweet', name: 'Sweet', price: 40, available: true, maxPerDay: 1 },
    { id: 'meals', name: 'Meals', price: 100, available: true },
  ],
} as unknown as Menu;
const mockDinner = {
  id: 'm2',
  restaurantId: 'r1',
  name: 'Dinner',
  date: localDateString(new Date()),
  status: 'published',
  orderingEndTime: null,
  items: [{ id: 'chapati', name: 'Chapati', price: 30, available: true }],
} as unknown as Menu;
let mockMenus: Menu[] = [mockMenu];
let mockOrders: Order[] = [];

jest.mock('@/store/serverApi', () => ({
  ...jest.requireActual('@/store/serverApi'),
  useGetRestaurantQuery: () => ({ data: mockRestaurant, isLoading: false, refetch: jest.fn() }),
  useGetPublishedMenusQuery: () => ({ data: mockMenus, isFetching: false, refetch: jest.fn() }),
  useGetMyOrdersQuery: () => ({ data: mockOrders }),
}));

const renderScreen = async (store = makeStore()) =>
  render(
    <Provider store={store}>
      <RestaurantScreen />
    </Provider>
  );

describe('RestaurantScreen dish limits', () => {
  beforeEach(() => {
    mockMenus = [mockMenu];
    mockOrders = [{ id: 'o1', menuId: 'm1', status: 'confirmed', items: [{ menuItemId: 'sweet', quantity: 1 }] } as Order];
  });

  test('shows each dish’s limits, and a used-up daily limit', async () => {
    await renderScreen();
    expect(screen.getByText('Max 2 per order · Max 3 per person a day')).toBeTruthy();
    // Already ordered the one Sweet allowed today
    expect(screen.getByText('Limit reached')).toBeTruthy();
    expect(screen.getAllByText('Add')).toHaveLength(2);
  });

  test('the stepper stops at the limit', async () => {
    await renderScreen();
    await fireEvent.press(screen.getAllByText('Add')[0]); // Biryani
    const plus = screen.getByLabelText('Add one Biryani');
    await fireEvent.press(plus);
    expect(screen.getByLabelText('2 Biryani in cart')).toBeTruthy();
    expect(screen.getByLabelText('Add one Biryani').props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe('RestaurantScreen with several menus a day', () => {
  beforeEach(() => {
    mockMenus = [mockMenu, mockDinner];
    mockOrders = [];
  });

  test('a tab per menu; dishes from both go in the same cart', async () => {
    const store = makeStore();
    await renderScreen(store);
    expect(screen.getByText('Biryani')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Add')[0]); // Biryani, from lunch

    await fireEvent.press(screen.getByText('Dinner'));
    expect(screen.queryByText('Biryani')).toBeNull();
    await fireEvent.press(screen.getByText('Add')); // Chapati, from dinner

    expect(store.getState().cart.menus.map((m) => [m.menuName, m.lines[0].name])).toEqual([
      ['Lunch', 'Biryani'],
      ['Dinner', 'Chapati'],
    ]);
  });

  test('with one menu there are no tabs', async () => {
    mockMenus = [mockMenu];
    await renderScreen();
    expect(screen.queryByText('Lunch')).toBeNull();
  });
});
