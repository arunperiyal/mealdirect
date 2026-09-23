import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import type { RiderProfile, User } from '@mealdirect/shared';
import PayoutScreen from '@/app/(app)/profile/payout';
import PersonalScreen from '@/app/(app)/profile/personal';
import { makeStore } from '@/store';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

const mockPayout = jest.fn();
const mockPersonal = jest.fn();
let mockProfile: RiderProfile;

jest.mock('@/store/serverApi', () => ({
  ...jest.requireActual('@/store/serverApi'),
  useGetProfileQuery: () => ({ data: mockProfile, refetch: jest.fn() }),
  useUpdatePayoutMutation: () => [(arg: unknown) => ({ unwrap: () => mockPayout(arg) }), { isLoading: false }],
  useUpdatePersonalMutation: () => [(arg: unknown) => ({ unwrap: () => mockPersonal(arg) }), { isLoading: false }],
}));

const me = { id: 'rider-1', email: 'ravi@x.co', firstName: 'Ravi', lastName: 'R', phone: '9876500000', role: 'delivery_partner', riderStatus: 'approved' } as User;

const baseProfile: RiderProfile = {
  id: 'rider-1',
  email: 'ravi@x.co',
  riderStatus: 'approved',
  firstName: 'Ravi',
  lastName: 'R',
  phone: '9876500000',
  upiId: null,
  bankAccountName: null,
  bankAccountNumber: null,
  bankIFSC: null,
  changeRequests: {},
};

const renderWith = async (ui: React.ReactElement, profile: Partial<RiderProfile> = {}) => {
  mockProfile = { ...baseProfile, ...profile };
  await render(<Provider store={makeStore({ auth: { status: 'signedIn', user: me } })}>{ui}</Provider>);
};

const fill = async (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);

describe('Payout details', () => {
  beforeEach(() => mockPayout.mockReset());

  test('checks every field, then sends a change for review', async () => {
    mockPayout.mockResolvedValue({ applied: false, changeRequest: { id: 'cr1', status: 'pending' } });
    await renderWith(<PayoutScreen />);

    await fireEvent.press(screen.getByText('Save payout details'));
    expect(screen.getByText('Enter a UPI ID')).toBeTruthy();
    expect(mockPayout).not.toHaveBeenCalled();

    await fill('UPI ID', 'ravi@okaxis');
    await fill('Account holder name', 'Ravi Kumar');
    await fill('Account number', '1234 5678 9012');
    await fill('IFSC', 'sbin0001234');
    await fireEvent.press(screen.getByText('Save payout details'));

    expect(mockPayout).toHaveBeenCalledWith({
      upiId: 'ravi@okaxis',
      bankAccountName: 'Ravi Kumar',
      bankAccountNumber: '123456789012',
      bankIFSC: 'SBIN0001234',
    });
    expect(await screen.findByText(/Sent to MealDirect/)).toBeTruthy();
  });

  test('shows a change waiting for review, starting from what was sent', async () => {
    await renderWith(<PayoutScreen />, {
      upiId: 'old@okaxis',
      changeRequests: {
        payout: {
          id: 'cr1',
          kind: 'payout',
          status: 'pending',
          changes: { upiId: 'new@okaxis' },
          reviewNote: null,
          createdAt: '2026-09-23T10:00:00Z',
          updatedAt: '2026-09-23T10:00:00Z',
          reviewedAt: null,
        },
      },
    });
    expect(screen.getByText(/Your new UPI ID is waiting for MealDirect to approve/)).toBeTruthy();
    expect(screen.getByLabelText('UPI ID').props.value).toBe('new@okaxis');
  });

  test('shows why a change was turned down', async () => {
    await renderWith(<PayoutScreen />, {
      changeRequests: {
        payout: {
          id: 'cr1',
          kind: 'payout',
          status: 'rejected',
          changes: { upiId: 'new@okaxis', bankIFSC: 'SBIN0001234' },
          reviewNote: 'Name does not match',
          createdAt: '2026-09-23T10:00:00Z',
          updatedAt: '2026-09-23T10:00:00Z',
          reviewedAt: '2026-09-23T11:00:00Z',
        },
      },
    });
    expect(screen.getByText(/didn't approve your new UPI ID and IFSC: Name does not match/)).toBeTruthy();
  });
});

describe('Personal details', () => {
  beforeEach(() => mockPersonal.mockReset());

  test('a rider waiting for approval saves straight away', async () => {
    mockPersonal.mockResolvedValue({ applied: true, changeRequest: null });
    await renderWith(<PersonalScreen />, { riderStatus: 'pending' });

    await fill('Phone', '12');
    await fireEvent.press(screen.getByText('Save'));
    expect(screen.getByText('Enter a valid phone number')).toBeTruthy();

    await fill('Phone', '98765 11111');
    await fill('Last name (optional)', '');
    await fireEvent.press(screen.getByText('Save'));
    expect(mockPersonal).toHaveBeenCalledWith({ firstName: 'Ravi', lastName: null, phone: '9876511111' });
    expect(await screen.findByText('Saved')).toBeTruthy();
  });
});
