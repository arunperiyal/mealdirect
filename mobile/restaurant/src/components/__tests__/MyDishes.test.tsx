import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import type { Dish, OwnedRestaurant } from '@mealdirect/shared';
import DishesScreen from '@/app/(app)/dishes';
import { makeStore } from '@/store';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockRestaurant = { id: 'r1', name: 'Amma Mess' } as OwnedRestaurant;
jest.mock('@/lib/useRestaurant', () => ({ useRestaurant: () => mockRestaurant }));

let mockDishes: Dish[] = [];
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
const mockImport = jest.fn();
const mockQuery = jest.fn();
const mutation = (fn: jest.Mock) => [(arg: unknown) => ({ unwrap: () => fn(arg) }), { isLoading: false }];

jest.mock('@/store/serverApi', () => ({
  ...jest.requireActual('@/store/serverApi'),
  useGetDishesQuery: (args: unknown) => {
    mockQuery(args);
    return { data: mockDishes, isLoading: false, isFetching: false, refetch: jest.fn() };
  },
  useCreateDishMutation: () => mutation(mockCreate),
  useUpdateDishMutation: () => mutation(mockUpdate),
  useRemoveDishMutation: () => mutation(mockRemove),
  useRestoreDishMutation: () => mutation(jest.fn()),
  useImportDishesMutation: () => mutation(mockImport),
}));

const dish = (overrides: Partial<Dish>): Dish =>
  ({ id: 'd1', restaurantId: 'r1', name: 'Dosa', description: '', price: '45.00', maxPerOrder: null, maxPerDay: null, archived: false, ...overrides }) as Dish;

const renderScreen = async () =>
  render(
    <Provider store={makeStore()}>
      <DishesScreen />
    </Provider>
  );

describe('My dishes', () => {
  beforeEach(() => {
    [mockCreate, mockUpdate, mockRemove, mockImport, mockQuery].forEach((m) => m.mockReset());
    mockDishes = [];
  });

  test('with no dishes, offers to copy them from existing menus', async () => {
    mockImport.mockResolvedValue({ imported: 3, dishes: [] });
    await renderScreen();
    expect(screen.getByText('No dishes yet')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add dishes from my menus'));
    expect(mockImport).toHaveBeenCalledWith('r1');
    expect(await screen.findByText('Added 3 dishes from your menus.')).toBeTruthy();
  });

  test('adds a dish, checking its fields first', async () => {
    mockCreate.mockResolvedValue(dish({ name: 'Pongal' }));
    await renderScreen();
    await fireEvent.press(screen.getByText('Add dish'));
    await fireEvent.press(screen.getAllByText('Add dish').at(-1)!);
    expect(screen.getByText('Enter a name')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Name'), ' Pongal ');
    await fireEvent.changeText(screen.getByLabelText('Price (₹)'), '50');
    await fireEvent.press(screen.getAllByText('Add dish').at(-1)!);
    expect(mockCreate).toHaveBeenCalledWith({
      restaurantId: 'r1',
      name: 'Pongal',
      description: '',
      price: 50,
      maxPerOrder: null,
      maxPerDay: null,
    });
    expect(await screen.findByText('Added Pongal.')).toBeTruthy();
  });

  test('edits and removes a dish', async () => {
    mockDishes = [dish({ maxPerDay: 4 })];
    mockUpdate.mockResolvedValue({});
    mockRemove.mockResolvedValue({});
    await renderScreen();
    expect(screen.getByText('₹45.00 · 4 a day per person')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Edit Dosa'));
    expect(screen.getByLabelText('Price (₹)').props.value).toBe('45');
    await fireEvent.changeText(screen.getByLabelText('Price (₹)'), '50');
    await fireEvent.press(screen.getByText('Save dish'));
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1', price: 50, maxPerDay: 4 }));

    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Remove')?.onPress?.();
    });
    await fireEvent.press(screen.getByLabelText('Edit Dosa'));
    await fireEvent.press(screen.getByText('Remove dish'));
    expect(mockRemove).toHaveBeenCalledWith('d1');
    alert.mockRestore();
  });

  test('shows removed dishes separately', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Removed'));
    expect(mockQuery).toHaveBeenLastCalledWith({ restaurantId: 'r1', archived: true });
    expect(screen.getByText('No removed dishes')).toBeTruthy();
    expect(screen.queryByText('Add dish')).toBeNull();
  });
});
