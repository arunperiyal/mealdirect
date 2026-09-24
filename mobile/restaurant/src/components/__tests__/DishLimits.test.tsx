import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import type { Menu, OwnedRestaurant } from '@mealdirect/shared';
import MenuScreen from '@/app/(app)/menu/[id]';
import { makeStore } from '@/store';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'm1' }),
  Stack: { Screen: () => null },
  router: { back: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockRestaurant = { id: 'r1', name: 'Amma Mess' } as OwnedRestaurant;
jest.mock('@/lib/useRestaurant', () => ({ useRestaurant: () => mockRestaurant }));

const mockMenu = {
  id: 'm1',
  restaurantId: 'r1',
  date: '2026-09-24',
  status: 'draft',
  orderingStartTime: null,
  orderingEndTime: null,
  items: [{ id: 'b', dishId: 'b-dish', name: 'Biryani', price: 200, available: true, maxPerOrder: 2, maxPerDay: 3 }],
} as unknown as Menu;
const mockUpdate = jest.fn();
const mockAdd = jest.fn();
const mockCreateDish = jest.fn();
let mockDishes: unknown[] = [];

jest.mock('@/store/serverApi', () => ({
  ...jest.requireActual('@/store/serverApi'),
  useGetMenuQuery: () => ({ data: mockMenu, isLoading: false, isFetching: false, refetch: jest.fn() }),
  useGetMenuSlotsQuery: () => ({ data: [], isLoading: false }),
  useUpdateMenuItemMutation: () => [(arg: unknown) => ({ unwrap: () => mockUpdate(arg) }), { isLoading: false }],
  useCreateDishMutation: () => [(arg: unknown) => ({ unwrap: () => mockCreateDish(arg) }), { isLoading: false }],
  useAddDishesToMenuMutation: () => [(arg: unknown) => ({ unwrap: () => mockAdd(arg) }), { isLoading: false }],
  useGetDishesQuery: () => ({ data: mockDishes, isLoading: false }),
  useRemoveMenuItemMutation: () => [jest.fn(), { isLoading: false }],
  useSetMenuStatusMutation: () => [jest.fn(), { isLoading: false }],
  useAddSlotMutation: () => [jest.fn(), { isLoading: false }],
  useUpdateSlotMutation: () => [jest.fn(), { isLoading: false }],
  useDeleteSlotMutation: () => [jest.fn(), { isLoading: false }],
}));

const renderScreen = async () =>
  render(
    <Provider store={makeStore()}>
      <MenuScreen />
    </Provider>
  );

describe('Dish limits (partner)', () => {
  beforeEach(() => {
    mockUpdate.mockReset().mockResolvedValue({});
    mockAdd.mockReset().mockResolvedValue({});
  });

  test('the dish list shows its limits', async () => {
    await renderScreen();
    expect(screen.getByText('₹200.00 · max 2 per order · 3 a day per person')).toBeTruthy();
  });

  test('editing a dish changes or clears its limits', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Edit Biryani'));
    expect(screen.getByLabelText('Max per order').props.value).toBe('2');

    await fireEvent.changeText(screen.getByLabelText('Max per order'), '5');
    await fireEvent.press(screen.getByText('Save dish'));
    expect(screen.getByText('Can’t be more than the limit per day')).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Max per order'), '');
    await fireEvent.press(screen.getByText('Save dish'));
    expect(mockUpdate).toHaveBeenCalledWith({
      menuId: 'm1',
      itemId: 'b',
      changes: expect.objectContaining({ maxPerOrder: null, maxPerDay: 3 }),
    });
  });

  test('a new dish can start with a daily limit; it is saved to My dishes and added to the menu', async () => {
    mockCreateDish.mockReset().mockResolvedValue({ id: 'd-new' });
    await renderScreen();
    await fireEvent.press(screen.getByText('Add dishes'));
    await fireEvent.press(screen.getByText('New dish'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Payasam');
    await fireEvent.changeText(screen.getByLabelText('Price (₹)'), '40');
    await fireEvent.changeText(screen.getByLabelText('Max per day'), '1');
    await fireEvent.press(screen.getByText('Save and add to menu'));
    expect(mockCreateDish).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'r1', name: 'Payasam', price: 40, maxPerOrder: null, maxPerDay: 1 })
    );
    expect(mockAdd).toHaveBeenCalledWith({ menuId: 'm1', dishIds: ['d-new'] });
  });

  test('picks several dishes from My dishes, leaving out ones already on the menu', async () => {
    mockDishes = [
      { id: 'd1', name: 'Dosa', price: '45.00', maxPerOrder: null, maxPerDay: null },
      { id: 'd2', name: 'Idli', price: 30, maxPerOrder: null, maxPerDay: 4 },
      { id: 'b-dish', name: 'Biryani', price: 200, maxPerOrder: 2, maxPerDay: 3 },
    ];
    await renderScreen();
    await fireEvent.press(screen.getByText('Add dishes'));
    // Biryani's dish is already on this menu
    expect(screen.queryByLabelText('Biryani')).toBeNull();
    expect(screen.getByText('₹30.00 · 4 a day per person')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Dosa'));
    await fireEvent.press(screen.getByLabelText('Idli'));
    await fireEvent.press(screen.getByText('Add 2 dishes'));
    expect(mockAdd).toHaveBeenCalledWith({ menuId: 'm1', dishIds: ['d1', 'd2'] });
    mockDishes = [];
  });
});
