import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import CartScreen from '@/app/(app)/cart';
import { makeStore } from '@/store';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), dismissTo: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock; dismissTo: jest.Mock } };

type Line = { menuItemId: string; name: string; price: number; quantity: number; maxQuantity?: number };

const renderCart = async (lines: Line[], dinner: Line[] = []) => {
  const menu = (menuId: string, menuName: string, menuLines: Line[]) => ({
    menuId,
    menuName,
    menuDate: '2026-09-23',
    lines: menuLines.map((l) => ({ maxQuantity: 20, ...l })),
  });
  const store = makeStore({
    cart: {
      restaurantId: 'r1',
      restaurantName: 'Amma Mess',
      menus: [menu('m1', 'Lunch', lines), ...(dinner.length ? [menu('m2', 'Dinner', dinner)] : [])],
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
    expect(store.getState().cart.menus[0].lines[0].quantity).toBe(2);

    await fireEvent.press(screen.getByLabelText('Remove one Meals'));
    await fireEvent.press(screen.getByLabelText('Remove one Meals'));
    expect(store.getState().cart.menus).toHaveLength(0);
    expect(screen.getByText('Your cart is empty')).toBeTruthy();
  });

  test("dishes from two of the restaurant's menus are listed per menu, as separate orders", async () => {
    await renderCart([{ menuItemId: 'a', name: 'Meals', price: 120, quantity: 1 }], [{ menuItemId: 'a', name: 'Chapati', price: 40, quantity: 2 }]);
    expect(screen.getByText(/^Lunch · /)).toBeTruthy();
    expect(screen.getByText(/^Dinner · /)).toBeTruthy();
    expect(screen.getByText('Each menu is a separate order, with its own delivery time and bill.')).toBeTruthy();
    expect(screen.getByText(/200\.00/)).toBeTruthy();
  });

  test('proceeds to checkout', async () => {
    await renderCart([{ menuItemId: 'a', name: 'Meals', price: 120, quantity: 1 }]);
    await fireEvent.press(screen.getByText('Proceed to checkout'));
    expect(router.push).toHaveBeenCalledWith('/checkout');
  });
});
