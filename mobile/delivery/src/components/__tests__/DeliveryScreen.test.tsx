import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import type { Order, User } from '@mealdirect/shared';
import DeliveryScreen from '@/app/(app)/delivery/[id]';
import { makeStore } from '@/store';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'o1' }),
  useIsFocused: () => true,
  router: { back: jest.fn() },
}));

const mockAct = jest.fn();
let mockOrder: Order;

jest.mock('@/store/serverApi', () => ({
  ...jest.requireActual('@/store/serverApi'),
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
    expect(screen.getByText('Collect ₹282.00 cash')).toBeTruthy();
    await fireEvent.press(screen.getByText('Picked up from restaurant'));
    expect(mockAct).toHaveBeenCalledWith({ id: 'o1', action: 'pick-up' });
  });

  test('delivering a cash order asks to confirm the cash first', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Yes, delivered')?.onPress?.();
    });
    await renderScreen({ riderId: 'rider-1', status: 'out_for_delivery' });
    await fireEvent.press(screen.getByText(/Delivered · collected/));
    expect(alert).toHaveBeenCalledWith('Collected ₹282.00?', expect.any(String), expect.any(Array));
    expect(mockAct).toHaveBeenCalledWith({ id: 'o1', action: 'deliver' });
    alert.mockRestore();
  });

  test("another rider's order shows no actions", async () => {
    await renderScreen({ riderId: 'someone-else', status: 'ready' });
    expect(screen.getByText('Another delivery partner is handling this order.')).toBeTruthy();
    expect(screen.queryByText('Accept delivery')).toBeNull();
    expect(screen.queryByText('Give this delivery back')).toBeNull();
  });
});
