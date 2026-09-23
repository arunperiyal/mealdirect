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
  items: [{ id: 'b', name: 'Biryani', price: 200, available: true, maxPerOrder: 2, maxPerDay: 3 }],
} as unknown as Menu;
const mockUpdate = jest.fn();
const mockAdd = jest.fn();

jest.mock('@/store/serverApi', () => ({
  ...jest.requireActual('@/store/serverApi'),
  useGetMenuQuery: () => ({ data: mockMenu, isLoading: false, isFetching: false, refetch: jest.fn() }),
  useGetMenuSlotsQuery: () => ({ data: [], isLoading: false }),
  useUpdateMenuItemMutation: () => [(arg: unknown) => ({ unwrap: () => mockUpdate(arg) }), { isLoading: false }],
  useAddMenuItemMutation: () => [(arg: unknown) => ({ unwrap: () => mockAdd(arg) }), { isLoading: false }],
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

  test('a new dish can start with a daily limit', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Add dish'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Payasam');
    await fireEvent.changeText(screen.getByLabelText('Price (₹)'), '40');
    await fireEvent.changeText(screen.getByLabelText('Max per day'), '1');
    await fireEvent.press(screen.getAllByText('Add dish').at(-1)!);
    expect(mockAdd).toHaveBeenCalledWith({
      menuId: 'm1',
      item: expect.objectContaining({ name: 'Payasam', price: 40, maxPerOrder: null, maxPerDay: 1 }),
    });
  });
});
