import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import type { Order } from '@mealdirect/shared';
import OrderScreen from '@/app/(app)/order/[id]';
import { makeStore } from '@/store';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'o1' }) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockResolve = jest.fn();
let mockOrder: Order;

jest.mock('@/store/serverApi', () => ({
  ...jest.requireActual('@/store/serverApi'),
  useGetOrderQuery: () => ({ data: mockOrder, isLoading: false, isFetching: false, refetch: jest.fn() }),
  useCancelOrderMutation: () => [jest.fn(), { isLoading: false }],
  useResolvePaymentMutation: () => [(arg: unknown) => ({ unwrap: () => mockResolve(arg) }), { isLoading: false }],
}));

const notPaid = {
  id: 'o1',
  status: 'delivered',
  deliveryType: 'delivery',
  deliveryAddress: '1 Road',
  paymentMethod: 'cod',
  paymentStatus: 'failed',
  collectionStatus: 'not_paid',
  collectionNote: 'Customer said they would pay later',
  collectedById: 'rider-1',
  collectedAt: new Date().toISOString(),
  riderId: 'rider-1',
  rider: { id: 'rider-1', firstName: 'Ravi', lastName: 'R', phone: '9' },
  total: '282.00',
  subtotal: '240.00',
  tax: '12.00',
  deliveryFee: '30.00',
  items: [],
  statusHistory: [],
  createdAt: new Date().toISOString(),
} as unknown as Order;

const renderScreen = async (order: Order) => {
  mockOrder = order;
  await render(
    <Provider store={makeStore()}>
      <OrderScreen />
    </Provider>
  );
};

describe('resolving an unpaid order', () => {
  beforeEach(() => mockResolve.mockReset().mockResolvedValue({}));

  test('shows what the rider reported', async () => {
    await renderScreen(notPaid);
    expect(screen.getByText('Not paid')).toBeTruthy();
    expect(screen.getByText(/by Ravi R/)).toBeTruthy();
    expect(screen.getByText('Customer said they would pay later')).toBeTruthy();
  });

  test('marking paid needs a note and records the method', async () => {
    await renderScreen(notPaid);
    await fireEvent.press(screen.getByText('Mark paid'));
    await fireEvent.press(screen.getByText('UPI'));
    await fireEvent.press(screen.getAllByText('Mark paid').at(-1)!);
    expect(mockResolve).not.toHaveBeenCalled();
    expect(screen.getByText('Add a note explaining the resolution')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Note'), 'Paid MealDirect UPI next morning');
    await fireEvent.press(screen.getAllByText('Mark paid').at(-1)!);
    expect(mockResolve).toHaveBeenCalledWith({
      id: 'o1',
      outcome: 'collected',
      method: 'upi',
      note: 'Paid MealDirect UPI next morning',
    });
  });

  test('write-off sends no method', async () => {
    await renderScreen(notPaid);
    await fireEvent.press(screen.getByText('Write off'));
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Goodwill');
    await fireEvent.press(screen.getAllByText('Write off').at(-1)!);
    expect(mockResolve).toHaveBeenCalledWith({ id: 'o1', outcome: 'written_off', note: 'Goodwill' });
  });

  test('paid orders offer nothing to resolve', async () => {
    await renderScreen({ ...notPaid, collectionStatus: 'collected', collectionMethod: 'cash', paymentStatus: 'completed' } as Order);
    expect(screen.getByText('Paid in cash')).toBeTruthy();
    expect(screen.queryByText('Mark paid')).toBeNull();
  });
});
