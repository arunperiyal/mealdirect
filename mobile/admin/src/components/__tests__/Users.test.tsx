import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import type { AdminUser } from '@mealdirect/shared';
import UsersScreen from '@/app/(app)/users';
import { makeStore } from '@/store';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockChange = jest.fn();
const mockQuery = jest.fn();
const mockUsers: AdminUser[] = [
  { id: 'u1', email: 'priya@old.test', firstName: 'Priya', lastName: 'R', phone: '9876543210', role: 'customer', riderStatus: null, createdAt: '2026-09-20T10:00:00Z' },
  { id: 'u2', email: 'ravi@rider.test', firstName: 'Ravi', lastName: null, phone: null, role: 'delivery_partner', riderStatus: 'approved', createdAt: '2026-09-21T10:00:00Z' },
];

jest.mock('@/store/serverApi', () => ({
  ...jest.requireActual('@/store/serverApi'),
  useGetUsersQuery: (args: unknown) => {
    mockQuery(args);
    return { data: mockUsers, isLoading: false, isFetching: false, refetch: jest.fn() };
  },
  useChangeUserEmailMutation: () => [(arg: unknown) => ({ unwrap: () => mockChange(arg) }), { isLoading: false }],
}));

const renderScreen = async () =>
  render(
    <Provider store={makeStore()}>
      <UsersScreen />
    </Provider>
  );

describe('UsersScreen', () => {
  beforeEach(() => {
    mockChange.mockReset();
    mockQuery.mockReset();
  });

  test('lists users with their role and filters by role', async () => {
    await renderScreen();
    expect(screen.getByText('priya@old.test')).toBeTruthy();
    expect(screen.getByText(/^Rider · joined/)).toBeTruthy();
    expect(screen.getByText(/^Customer · 9876543210/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Riders'));
    expect(mockQuery).toHaveBeenLastCalledWith({ role: 'delivery_partner', search: undefined });
  });

  test('changes a user’s email after checking it', async () => {
    mockChange.mockResolvedValue({ ...mockUsers[0], email: 'priya@new.test' });
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Change email for Priya R'));

    await fireEvent.changeText(screen.getByLabelText('Email'), 'not an email');
    await fireEvent.press(screen.getAllByText('Change email').at(-1)!);
    expect(mockChange).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Email'), ' priya@new.test ');
    await fireEvent.press(screen.getAllByText('Change email').at(-1)!);
    expect(mockChange).toHaveBeenCalledWith({ id: 'u1', email: 'priya@new.test' });
    expect(await screen.findByText('Priya R now signs in with priya@new.test.')).toBeTruthy();
  });

  test('shows why a change was refused', async () => {
    mockChange.mockRejectedValue({ status: 409, code: 'EMAIL_EXISTS', message: 'Another account already uses this email' });
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Change email for Ravi'));
    await fireEvent.changeText(screen.getByLabelText('Email'), 'priya@old.test');
    await fireEvent.press(screen.getAllByText('Change email').at(-1)!);
    expect(await screen.findByText('Another account already uses this email')).toBeTruthy();
  });
});
