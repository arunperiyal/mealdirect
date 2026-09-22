import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import type { AdminRestaurantDetail } from '@mealdirect/shared';
import RestaurantScreen from '@/app/(app)/restaurant/[id]';
import { makeStore } from '@/store';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'r1' }),
  Stack: { Screen: () => null },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockReview = jest.fn();
let mockDetail: AdminRestaurantDetail;

jest.mock('@/store/serverApi', () => ({
  ...jest.requireActual('@/store/serverApi'),
  useGetRestaurantQuery: () => ({ data: mockDetail, isLoading: false, isFetching: false, refetch: jest.fn() }),
  useReviewRestaurantMutation: () => [(arg: unknown) => ({ unwrap: () => mockReview(arg) }), { isLoading: false }],
}));

const detail = (overrides: Partial<AdminRestaurantDetail['restaurant']> = {}): AdminRestaurantDetail =>
  ({
    restaurant: {
      id: 'r1',
      name: "Jane's Diner",
      email: 'diner@example.com',
      phone: '9876543210',
      address: '1 Main St',
      city: 'Smartsville',
      zipCode: null,
      description: 'Home-style meals',
      verificationStatus: 'pending',
      verificationNotes: null,
      isApproved: false,
      deliveryEnabled: true,
      pickupEnabled: true,
      upiId: null,
      bankAccountNumber: '123456789012',
      bankIFSC: 'HDFC0001234',
      createdAt: '2026-09-22T21:27:05.000Z',
      approvedAt: null,
      owner: { id: 'u1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null },
      ...overrides,
    },
    stats: {
      orders: 0,
      cancelled: 0,
      revenue: 0,
      averageOrderValue: 0,
      last30Days: { orders: 0, cancelled: 0, revenue: 0, averageOrderValue: 0 },
      lastOrderAt: null,
    },
  }) as AdminRestaurantDetail;

const renderScreen = async (d: AdminRestaurantDetail) => {
  mockDetail = d;
  await render(
    <Provider store={makeStore()}>
      <RestaurantScreen />
    </Provider>
  );
};

describe('restaurant review', () => {
  beforeEach(() => mockReview.mockReset().mockResolvedValue({}));

  test('shows owner contact and masks the bank account', async () => {
    await renderScreen(detail());
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText('jane@example.com')).toBeTruthy();
    expect(screen.getByText('Account ending 9012 · HDFC0001234')).toBeTruthy();
    expect(screen.queryByText(/123456789012/)).toBeNull();
  });

  test('approving sends an optional note', async () => {
    await renderScreen(detail());
    await fireEvent.press(screen.getByText('Approve'));
    await fireEvent.press(screen.getAllByText('Approve').at(-1)!);
    expect(mockReview).toHaveBeenCalledWith({ id: 'r1', decision: 'approve', notes: '' });
    expect(screen.getByText("Jane's Diner is live.")).toBeTruthy();
  });

  test('rejecting requires a note for the owner', async () => {
    await renderScreen(detail());
    await fireEvent.press(screen.getByText('Reject'));
    await fireEvent.press(screen.getAllByText('Reject').at(-1)!);
    expect(mockReview).not.toHaveBeenCalled();
    expect(screen.getByText(/Tell the owner what to fix/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('What should the owner fix?'), 'Add your FSSAI licence');
    await fireEvent.press(screen.getAllByText('Reject').at(-1)!);
    expect(mockReview).toHaveBeenCalledWith({ id: 'r1', decision: 'reject', notes: 'Add your FSSAI licence' });
  });

  test('live restaurants show stats instead of review buttons', async () => {
    await renderScreen(detail({ verificationStatus: 'verified', isApproved: true, approvedAt: '2026-09-22T21:30:37.000Z' }));
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.getByText('Last 30 days')).toBeTruthy();
  });
});
