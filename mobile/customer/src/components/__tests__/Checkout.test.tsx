import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import type { DeliverySlot, Restaurant } from '@mealdirect/shared';
import CheckoutScreen from '@/app/(app)/checkout';
import { makeStore } from '@/store';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), dismissTo: jest.fn(), navigate: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const { router } = jest.requireMock('expo-router') as { router: Record<string, jest.Mock> };

const mockCreate = jest.fn();
const mockRestaurant = {
  id: 'r1',
  name: 'Amma Mess',
  deliveryEnabled: true,
  pickupEnabled: true,
  defaultDeliveryFee: 20,
  minOrderForDelivery: 0,
} as unknown as Restaurant;
const slot = (id: string, startTime: string): DeliverySlot =>
  ({ id, startTime, endTime: startTime.replace(':00', ':30'), maxOrders: 10, currentOrders: 0 }) as DeliverySlot;
const mockSlots: Record<string, DeliverySlot[]> = { m1: [slot('lunch-1', '12:00')], m2: [slot('dinner-1', '19:00')] };

jest.mock('@/store/serverApi', () => ({
  ...jest.requireActual('@/store/serverApi'),
  useGetRestaurantQuery: () => ({ data: mockRestaurant, isLoading: false }),
  useGetConfigQuery: () => ({ data: { onlinePayments: false } }),
  useGetAddressesQuery: () => ({ data: [{ id: 'a1', label: 'Home', address: '1 Home Street', lastUsedAt: null, createdAt: '' }], isLoading: false }),
  useAddAddressMutation: () => [() => ({ unwrap: async () => ({}) })],
  useGetMenuSlotsQuery: (menuId: string) => ({ data: mockSlots[menuId], isFetching: false }),
  useCreateOrderMutation: () => [(arg: unknown) => ({ unwrap: () => mockCreate(arg) })],
}));

const cart = {
  restaurantId: 'r1',
  restaurantName: 'Amma Mess',
  menus: [
    { menuId: 'm1', menuName: 'Lunch', menuDate: '2026-09-23', lines: [{ menuItemId: 'meals', name: 'Meals', price: 100, quantity: 1, maxQuantity: 20 }] },
    { menuId: 'm2', menuName: 'Dinner', menuDate: '2026-09-23', lines: [{ menuItemId: 'chapati', name: 'Chapati', price: 30, quantity: 2, maxQuantity: 20 }] },
  ],
};

const renderCheckout = async () => {
  const store = makeStore({ cart });
  await render(
    <Provider store={store}>
      <CheckoutScreen />
    </Provider>
  );
  return store;
};

describe('Checkout with several menus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockReset();
  });

  test('one order per menu, each with its own delivery time', async () => {
    mockCreate.mockImplementation(async (arg: { menuId: string }) => ({ id: `order-${arg.menuId}` }));
    const store = await renderCheckout();
    // Two orders: ₹160 of food, 5% tax, and a ₹20 delivery fee on each
    expect(screen.getByText('Place 2 orders · ₹208.00')).toBeTruthy();

    await fireEvent.press(screen.getByText('Place 2 orders · ₹208.00'));
    expect(screen.getByText('Choose a delivery time for Lunch.')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('12:00 PM – 12:30 PM'));
    await fireEvent.press(screen.getByText('7:00 PM – 7:30 PM'));
    await fireEvent.press(screen.getByText('Place 2 orders · ₹208.00'));

    expect(mockCreate.mock.calls.map(([o]) => [o.menuId, o.deliverySlotId, o.deliveryAddress])).toEqual([
      ['m1', 'lunch-1', '1 Home Street'],
      ['m2', 'dinner-1', '1 Home Street'],
    ]);
    expect(store.getState().cart.menus).toEqual([]);
    expect(router.navigate).toHaveBeenCalledWith('/orders');
  });

  test("a menu that can't be ordered stays in the cart", async () => {
    mockCreate.mockImplementation(async (arg: { menuId: string }) => {
      if (arg.menuId === 'm2') throw { message: 'Orders for this menu closed at 18:00' };
      return { id: 'order-m1' };
    });
    const store = await renderCheckout();
    await fireEvent.press(screen.getByText('Pickup'));
    await fireEvent.press(screen.getByText(/^Place 2 orders/));

    expect(await screen.findByText('1 order was placed. Still in your cart: Dinner: Orders for this menu closed at 18:00')).toBeTruthy();
    expect(store.getState().cart.menus.map((m) => m.menuId)).toEqual(['m2']);
    expect(router.navigate).not.toHaveBeenCalled();
  });

});
