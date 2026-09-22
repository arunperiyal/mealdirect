import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import CartScreen from '@/app/(app)/cart';
import { makeStore } from '@/store';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), dismissTo: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock; dismissTo: jest.Mock } };

const renderCart = async (lines: { menuItemId: string; name: string; price: number; quantity: number }[]) => {
  const store = makeStore({
    cart: {
      restaurantId: 'r1',
      restaurantName: 'Amma Mess',
      menuId: 'm1',
      menuDate: '2026-09-23',
      lines,
    },
  });
  await render(
    <Provider store={store}>
      <CartScreen />
    </Provider>
  );
  return store;
};

describe('CartScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows lines and the item total', async () => {
    await renderCart([
      { menuItemId: 'a', name: 'Meals', price: 120, quantity: 2 },
      { menuItemId: 'b', name: 'Curd rice', price: 60, quantity: 1 },
    ]);
    expect(screen.getByText('Amma Mess')).toBeTruthy();
    expect(screen.getByText('Meals')).toBeTruthy();
    expect(screen.getByText(/300\.00/)).toBeTruthy();
  });

  test('steppers update quantities in the store', async () => {
    const store = await renderCart([{ menuItemId: 'a', name: 'Meals', price: 120, quantity: 1 }]);

    await fireEvent.press(screen.getByLabelText('Add one Meals'));
    expect(store.getState().cart.lines[0].quantity).toBe(2);

    await fireEvent.press(screen.getByLabelText('Remove one Meals'));
    await fireEvent.press(screen.getByLabelText('Remove one Meals'));
    expect(store.getState().cart.lines).toHaveLength(0);
    expect(screen.getByText('Your cart is empty')).toBeTruthy();
  });

  test('proceeds to checkout', async () => {
    await renderCart([{ menuItemId: 'a', name: 'Meals', price: 120, quantity: 1 }]);
    await fireEvent.press(screen.getByText('Proceed to checkout'));
    expect(router.push).toHaveBeenCalledWith('/checkout');
  });
});
