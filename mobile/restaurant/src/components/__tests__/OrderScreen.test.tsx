import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import type { Order } from '@mealdirect/shared';
import OrderScreen from '@/app/(app)/order/[id]';
import { makeStore } from '@/store';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'order-1' }),
  useIsFocused: () => true,
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockAdvance = jest.fn();
const mockCancel = jest.fn();
let mockOrder: Order;

jest.mock('@/store/serverApi', () => {
  const actual = jest.requireActual('@/store/serverApi');
  return {
    ...actual,
    useGetOrderQuery: () => ({ data: mockOrder, isLoading: false, isFetching: false, refetch: jest.fn() }),
    useAdvanceOrderMutation: () => [(arg: unknown) => ({ unwrap: () => mockAdvance(arg) }), { isLoading: false }],
    useCancelOrderMutation: () => [(arg: unknown) => ({ unwrap: () => mockCancel(arg) }), { isLoading: false }],
  };
});

const baseOrder = {
  id: 'order-1',
  customerId: 'c1',
  restaurantId: 'r1',
  menuId: 'm1',
  status: 'pending',
  deliveryType: 'delivery',
  deliveryAddress: 'Flat 4B, Test Towers',
  deliverySlotId: 's1',
  deliverySlot: { id: 's1', startTime: '12:30:00', endTime: '13:00:00' },
  paymentMethod: 'cod',
  paymentStatus: 'pending',
  items: [{ menuItemId: 'i1', name: 'Meals', quantity: 2, price: 120, total: 240 }],
  subtotal: '240.00',
  tax: '12.00',
  deliveryFee: '30.00',
  discount: '0.00',
  total: '282.00',
  statusHistory: [{ status: 'pending', timestamp: new Date().toISOString(), changedBy: 'c1' }],
  customerNotes: 'Less spicy please',
  cancellationReason: null,
  createdAt: new Date().toISOString(),
  customer: { id: 'c1', firstName: 'Priya', lastName: 'R', phone: '9876543210' },
} as Order;

const renderOrder = async (overrides: Partial<Order> = {}) => {
  mockOrder = { ...baseOrder, ...overrides };
  await render(
    <Provider store={makeStore()}>
      <OrderScreen />
    </Provider>
  );
};

describe('OrderScreen', () => {
  beforeEach(() => {
    mockAdvance.mockReset().mockResolvedValue({});
    mockCancel.mockReset().mockResolvedValue({});
  });

  test('shows who, where, when and what, and accepts a new cash order', async () => {
    await renderOrder();

    expect(screen.getByText('Priya R')).toBeTruthy();
    expect(screen.getByText('Flat 4B, Test Towers')).toBeTruthy();
    expect(screen.getByText(/12:30 PM and 1:00 PM/)).toBeTruthy();
    expect(screen.getByText('Less spicy please')).toBeTruthy();
    expect(screen.getByText('Call 9876543210')).toBeTruthy();

    await fireEvent.press(screen.getByText('Accept order'));
    expect(mockAdvance).toHaveBeenCalledWith({ id: 'order-1', action: 'confirm' });
  });

  test('offers the next step for each status', async () => {
    await renderOrder({ status: 'ready' });
    await fireEvent.press(screen.getByText('Send out yourself'));
    expect(mockAdvance).toHaveBeenCalledWith({ id: 'order-1', action: 'mark-out-for-delivery' });
  });

  test('does not let the restaurant accept an unpaid online order', async () => {
    await renderOrder({ paymentMethod: 'online' });
    expect(screen.queryByText('Accept order')).toBeNull();
    expect(screen.getByText(/Waiting for the customer to pay online/)).toBeTruthy();
  });

  test('cancelling needs a reason, which is sent to the server', async () => {
    await renderOrder();

    await fireEvent.press(screen.getByText('Cancel order'));
    const buttons = screen.getAllByText('Cancel order');
    await fireEvent.press(buttons[buttons.length - 1]); // the sheet's submit button
    expect(screen.getByText('Tell the customer why')).toBeTruthy();
    expect(mockCancel).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Item sold out'));
    await fireEvent.press(screen.getAllByText('Cancel order').at(-1)!);
    expect(mockCancel).toHaveBeenCalledWith({ id: 'order-1', reason: 'Item sold out' });
  });
});
