import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import type { KitchenDay, Order, OwnedRestaurant } from '@mealdirect/shared';
import KitchenScreen from '@/app/(app)/(tabs)/kitchen';
import OrderHandlingScreen from '@/app/(app)/settings/orders';
import { makeStore } from '@/store';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useIsFocused: () => true,
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockRestaurant = {
  id: 'r1',
  name: 'Amma Mess',
  autoAcceptOrders: false,
  autoReadyMinutes: null,
} as unknown as OwnedRestaurant;
jest.mock('@/lib/useRestaurant', () => ({ useRestaurant: () => mockRestaurant }));

const mockBulk = jest.fn();
const mockUpdateSettings = jest.fn();
let mockKitchen: KitchenDay;

jest.mock('@/store/serverApi', () => {
  const actual = jest.requireActual('@/store/serverApi');
  return {
    ...actual,
    useGetKitchenQuery: () => ({ data: mockKitchen, isLoading: false, isFetching: false, refetch: jest.fn() }),
    useBulkAdvanceMutation: () => [(arg: unknown) => ({ unwrap: () => mockBulk(arg) }), { isLoading: false }],
    useUpdateOrderSettingsMutation: () => [
      (arg: unknown) => ({ unwrap: () => mockUpdateSettings(arg) }),
      { isLoading: false },
    ],
  };
});

const order = (id: string, status: Order['status']) =>
  ({
    id: `${id}0000-0000-0000-0000-000000000000`,
    status,
    deliveryType: 'delivery',
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    total: '100.00',
    items: [{ menuItemId: 'i1', name: 'Meals', quantity: 1, price: 100, total: 100 }],
    createdAt: new Date().toISOString(),
    customer: { id: 'c1', firstName: 'Priya', lastName: 'R', phone: null },
  }) as unknown as Order;

const day = (): KitchenDay => ({
  date: '2026-09-23',
  menus: [{ id: 'm1', date: '2026-09-23', status: 'published', orderingEndTime: '10:30:00' }],
  totals: [
    { menuItemId: 'i1', name: 'Meals', quantity: 12 },
    { menuItemId: 'i2', name: 'Curd Rice', quantity: 3 },
  ],
  counts: { pending: 2, confirmed: 1 },
  groups: [
    {
      key: 's1',
      kind: 'slot',
      menuId: 'm1',
      slot: { id: 's1', startTime: '12:30:00', endTime: '13:00:00' },
      counts: { pending: 2 },
      dishTotals: [{ menuItemId: 'i1', name: 'Meals', quantity: 9 }],
      orders: [order('aaaa', 'pending'), order('bbbb', 'pending')],
    },
    {
      key: 'pickup',
      kind: 'pickup',
      menuId: 'm1',
      slot: null,
      counts: { confirmed: 1 },
      dishTotals: [{ menuItemId: 'i2', name: 'Curd Rice', quantity: 3 }],
      orders: [order('cccc', 'confirmed')],
    },
  ],
});

const renderWithStore = (ui: React.ReactElement) => render(<Provider store={makeStore()}>{ui}</Provider>);

describe('KitchenScreen', () => {
  beforeEach(() => {
    mockKitchen = day();
    mockBulk.mockReset().mockResolvedValue({ updated: 2, skipped: 0 });
  });

  test('shows what to cook and each delivery time with its own totals', async () => {
    await renderWithStore(<KitchenScreen />);

    expect(screen.getByText('To cook')).toBeTruthy();
    expect(screen.getByText('× 12')).toBeTruthy();
    expect(screen.getByText('2 new · 1 accepted')).toBeTruthy();
    expect(screen.getByText('Delivery 12:30 PM–1:00 PM')).toBeTruthy();
    expect(screen.getByText('Pickup')).toBeTruthy();

    // Orders stay folded until asked for
    expect(screen.queryByText('Priya R')).toBeNull();
    await fireEvent.press(screen.getByText('Show 2 orders'));
    expect(screen.getAllByText('Priya R')).toHaveLength(2);
  });

  test('accepts a whole delivery time in one tap', async () => {
    await renderWithStore(<KitchenScreen />);

    await fireEvent.press(screen.getByText('Accept all new (2)'));
    expect(mockBulk).toHaveBeenCalledWith({ menuId: 'm1', group: 's1', action: 'accept' });
    expect(await screen.findByText('Delivery 12:30 PM–1:00 PM: 2 orders accepted.')).toBeTruthy();
  });

  test('marks a group ready after confirming', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Mark ready')?.onPress?.();
    });
    mockBulk.mockResolvedValue({ updated: 1, skipped: 0 });
    await renderWithStore(<KitchenScreen />);

    await fireEvent.press(screen.getByText('Mark all ready (1)'));
    expect(alert).toHaveBeenCalled();
    expect(mockBulk).toHaveBeenCalledWith({ menuId: 'm1', group: 'pickup', action: 'ready' });
    expect(await screen.findByText('Pickup: 1 order marked ready.')).toBeTruthy();
    alert.mockRestore();
  });

  test('explains an empty day', async () => {
    mockKitchen = { ...day(), menus: [], groups: [], totals: [], counts: {} };
    await renderWithStore(<KitchenScreen />);
    expect(screen.getByText('No menu for today')).toBeTruthy();
  });
});

describe('OrderHandlingScreen', () => {
  beforeEach(() => mockUpdateSettings.mockReset().mockResolvedValue({}));

  test('saves auto-accept and auto-ready together', async () => {
    await renderWithStore(<OrderHandlingScreen />);

    await fireEvent(screen.getByLabelText('Accept orders automatically'), 'valueChange', true);
    await fireEvent.press(screen.getByText('15 min'));
    await fireEvent.press(screen.getByText('Save'));

    expect(mockUpdateSettings).toHaveBeenCalledWith({ id: 'r1', autoAcceptOrders: true, autoReadyMinutes: 15 });
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  test('turning auto-ready off sends null', async () => {
    mockRestaurant.autoReadyMinutes = 30;
    await renderWithStore(<OrderHandlingScreen />);
    await fireEvent.press(screen.getByText('Off'));
    await fireEvent.press(screen.getByText('Save'));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ id: 'r1', autoAcceptOrders: false, autoReadyMinutes: null });
    mockRestaurant.autoReadyMinutes = null;
  });
});
