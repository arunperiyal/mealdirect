import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import type { Order, User } from '@mealdirect/shared';
import DeliveryScreen from '@/app/(app)/delivery/[id]';
import { makeStore } from '@/store';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('react-native-qrcode-svg', () => {
  const { Text } = jest.requireActual('react-native');
  return { __esModule: true, default: ({ value }: { value: string }) => <Text testID="upi-qr">{value}</Text> };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'o1' }),
  useIsFocused: () => true,
  router: { back: jest.fn() },
}));

const mockAct = jest.fn();
let mockOrder: Order;

let mockUpi: { id: string; name: string } | null = { id: 'mealdirect@okbank', name: 'MealDirect' };

jest.mock('@/store/serverApi', () => ({
  ...jest.requireActual('@/store/serverApi'),
  useGetConfigQuery: () => ({ data: { onlinePayments: false, upi: mockUpi } }),
  useGetDeliveryQuery: () => ({ data: mockOrder, isLoading: false, isFetching: false, refetch: jest.fn() }),
  useActMutation: () => [(arg: unknown) => ({ unwrap: () => mockAct(arg) }), { isLoading: false }],
}));

const me = { id: 'rider-1', email: 'r@x.co', firstName: 'Ravi', lastName: 'R', phone: '9', role: 'delivery_partner', riderStatus: 'approved' } as User;

const base = {
  id: 'o1',
  status: 'ready',
  deliveryType: 'delivery',
  deliveryAddress: 'Flat 4B, Test Towers',
  paymentMethod: 'cod',
  paymentStatus: 'pending',
  total: '282.00',
  items: [{ menuItemId: 'i1', name: 'Meals', quantity: 2, price: 120, total: 240 }],
  statusHistory: [],
  createdAt: new Date().toISOString(),
  restaurant: { id: 'r1', name: 'Amma Mess', address: '12 Main St', city: 'Chennai', phone: '044123' },
  customer: { id: 'c1', firstName: 'Priya', lastName: null, phone: '98765' },
} as unknown as Order;

const renderScreen = async (overrides: Partial<Order>) => {
  mockOrder = { ...base, ...overrides };
  const store = makeStore({ auth: { status: 'signedIn', user: me } });
  await render(
    <Provider store={store}>
      <DeliveryScreen />
    </Provider>
  );
};

describe('DeliveryScreen', () => {
  beforeEach(() => mockAct.mockReset().mockResolvedValue({}));

  test('an unclaimed order can be accepted and hides the customer phone', async () => {
    await renderScreen({ riderId: null, customer: { id: 'c1', firstName: 'Priya', lastName: null, phone: null } });
    expect(screen.getByText(/phone number shows once you accept/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Accept delivery'));
    expect(mockAct).toHaveBeenCalledWith({ id: 'o1', action: 'claim' });
  });

  test('a ready order of mine is picked up', async () => {
    await renderScreen({ riderId: 'rider-1' });
    expect(screen.getByText('Collect ₹282.00')).toBeTruthy();
    expect(screen.getByText('Cash, or UPI to MealDirect')).toBeTruthy();
    await fireEvent.press(screen.getByText('Picked up from restaurant'));
    expect(mockAct).toHaveBeenCalledWith({ id: 'o1', action: 'pick-up' });
  });

  test('delivering records cash received', async () => {
    await renderScreen({ riderId: 'rider-1', status: 'out_for_delivery' });
    await fireEvent.press(screen.getByText('Delivered · collect ₹282.00'));
    await fireEvent.press(screen.getByText('Cash received · ₹282.00'));
    expect(mockAct).toHaveBeenCalledWith({ id: 'o1', action: 'deliver', collection: 'cash', note: undefined });
  });

  test('UPI shows a QR for the exact amount to MealDirect, then records UPI', async () => {
    await renderScreen({ riderId: 'rider-1', status: 'out_for_delivery' });
    await fireEvent.press(screen.getByText('Delivered · collect ₹282.00'));
    await fireEvent.press(screen.getByText('Customer pays by UPI'));
    expect(screen.getByTestId('upi-qr').props.children).toBe(
      'upi://pay?pa=mealdirect%40okbank&pn=MealDirect&am=282.00&cu=INR&tn=MealDirect%20order%20%23O1'
    );
    await fireEvent.press(screen.getByText('Customer has paid'));
    expect(mockAct).toHaveBeenCalledWith({ id: 'o1', action: 'deliver', collection: 'upi', note: undefined });
  });

  test('not paid is recorded with an optional note', async () => {
    await renderScreen({ riderId: 'rider-1', status: 'out_for_delivery' });
    await fireEvent.press(screen.getByText('Delivered · collect ₹282.00'));
    await fireEvent.press(screen.getByText('Not paid'));
    await fireEvent.changeText(screen.getByLabelText('What happened? (optional)'), 'Nobody answered');
    await fireEvent.press(screen.getByText('Mark as not paid'));
    expect(mockAct).toHaveBeenCalledWith({ id: 'o1', action: 'deliver', collection: 'not_paid', note: 'Nobody answered' });
  });

  test('UPI is unavailable when MealDirect’s UPI ID is not set', async () => {
    mockUpi = null;
    await renderScreen({ riderId: 'rider-1', status: 'out_for_delivery' });
    await fireEvent.press(screen.getByText('Delivered · collect ₹282.00'));
    expect(screen.getByText(/UPI isn’t set up yet/)).toBeTruthy();
    mockUpi = { id: 'mealdirect@okbank', name: 'MealDirect' };
  });

  test("another rider's order shows no actions", async () => {
    await renderScreen({ riderId: 'someone-else', status: 'ready' });
    expect(screen.getByText('Another delivery partner is handling this order.')).toBeTruthy();
    expect(screen.queryByText('Accept delivery')).toBeNull();
    expect(screen.queryByText('Give this delivery back')).toBeNull();
  });
});
