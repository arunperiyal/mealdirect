import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import type { AdminChangeRequest } from '@mealdirect/shared';
import ChangesScreen from '@/app/(app)/changes';
import { makeStore } from '@/store';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockReview = jest.fn();
let mockRequests: AdminChangeRequest[];

jest.mock('@/store/serverApi', () => ({
  ...jest.requireActual('@/store/serverApi'),
  useGetChangeRequestsQuery: () => ({ data: mockRequests, isLoading: false, isFetching: false, refetch: jest.fn() }),
  useReviewChangeMutation: () => [(arg: unknown) => ({ unwrap: () => mockReview(arg) }), { isLoading: false }],
}));

const payoutChange: AdminChangeRequest = {
  id: 'cr1',
  kind: 'payout',
  status: 'pending',
  subjectType: 'restaurant',
  subject: { id: 'r1', name: 'Amma Mess', city: 'Chennai', phone: '9876543210' },
  changes: { upiId: 'new@oksbi', bankAccountNumber: '998877665544' },
  current: { upiId: 'old@okhdfc', bankAccountNumber: '123456789012' },
  reviewNote: null,
  requestedBy: { id: 'u1', firstName: 'Lakshmi', lastName: null },
  createdAt: '2026-09-23T10:00:00Z',
  updatedAt: '2026-09-23T10:00:00Z',
  reviewedAt: null,
};

const renderScreen = async () =>
  render(
    <Provider store={makeStore()}>
      <ChangesScreen />
    </Provider>
  );

describe('ChangesScreen', () => {
  beforeEach(() => {
    mockRequests = [payoutChange];
    mockReview.mockReset().mockResolvedValue({});
  });

  test('shows the old and new values, masking account numbers', async () => {
    await renderScreen();
    expect(screen.getByText('Amma Mess · Payout details')).toBeTruthy();
    expect(screen.getByText('old@okhdfc')).toBeTruthy();
    expect(screen.getByText('new@oksbi')).toBeTruthy();
    expect(screen.getByText('Account ending 5544')).toBeTruthy();
    expect(screen.queryByText(/998877665544/)).toBeNull();
  });

  test('approves in one tap', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Approve'));
    expect(mockReview).toHaveBeenCalledWith({ id: 'cr1', decision: 'approve' });
    expect(await screen.findByText('Approved. The new details for Amma Mess are in use.')).toBeTruthy();
  });

  test('rejecting needs a note', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Reject'));
    await fireEvent.press(screen.getAllByText('Reject').at(-1)!);
    expect(mockReview).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('What should they fix?'), 'Name does not match');
    await fireEvent.press(screen.getAllByText('Reject').at(-1)!);
    expect(mockReview).toHaveBeenCalledWith({ id: 'cr1', decision: 'reject', note: 'Name does not match' });
  });

  test('says when there is nothing to review', async () => {
    mockRequests = [];
    await renderScreen();
    expect(screen.getByText('Nothing to review')).toBeTruthy();
  });
});
