import { fireEvent, render, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import type { OwnedRestaurant } from '@mealdirect/shared';
import BankScreen from '@/app/(app)/settings/bank';
import { makeStore } from '@/store';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

let mockRestaurant: OwnedRestaurant;
jest.mock('@/lib/useRestaurant', () => ({ useRestaurant: () => mockRestaurant }));

const mockUpdate = jest.fn();
jest.mock('@/store/serverApi', () => ({
  ...jest.requireActual('@/store/serverApi'),
  useUpdateBankDetailsMutation: () => [(arg: unknown) => ({ unwrap: () => mockUpdate(arg) }), { isLoading: false }],
}));

const saved = {
  id: 'r1',
  name: 'Amma Mess',
  isApproved: true,
  upiId: 'amma@okhdfc',
  bankAccountName: 'Amma Foods',
  bankAccountNumber: '123456789012',
  bankIFSC: 'HDFC0001234',
  changeRequests: {},
} as unknown as OwnedRestaurant;

const renderScreen = async (overrides: Partial<OwnedRestaurant> = {}) => {
  mockRestaurant = { ...saved, ...overrides };
  await render(
    <Provider store={makeStore()}>
      <BankScreen />
    </Provider>
  );
};

describe('Payout details (partner)', () => {
  beforeEach(() => mockUpdate.mockReset());

  test('an approved restaurant’s change is sent for review', async () => {
    mockUpdate.mockResolvedValue({ applied: false, changeRequest: { id: 'cr1', status: 'pending' } });
    await renderScreen();
    expect(screen.getByText(/MealDirect checks any change before it applies/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('UPI ID'), 'amma2@okhdfc');
    await fireEvent.press(screen.getByText('Save payout details'));
    expect(mockUpdate).toHaveBeenCalledWith({
      id: 'r1',
      upiId: 'amma2@okhdfc',
      bankAccountName: 'Amma Foods',
      bankAccountNumber: '123456789012',
      bankIFSC: 'HDFC0001234',
    });
    expect(await screen.findByText(/Sent to MealDirect/)).toBeTruthy();
  });

  test('every field is required', async () => {
    await renderScreen({ isApproved: false, upiId: null, bankAccountNumber: null });
    expect(screen.getByText(/needed for approval/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Save payout details'));
    expect(screen.getByText('Enter a UPI ID')).toBeTruthy();
    expect(screen.getByText('Account number is 9 to 18 digits')).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('shows a rejected change with the reason', async () => {
    await renderScreen({
      changeRequests: {
        payout: {
          id: 'cr1',
          kind: 'payout',
          status: 'rejected',
          changes: { bankAccountNumber: '998877665544' },
          reviewNote: 'Send a cancelled cheque to support',
          createdAt: '2026-09-23T10:00:00Z',
          updatedAt: '2026-09-23T10:00:00Z',
          reviewedAt: '2026-09-23T11:00:00Z',
        },
      },
    });
    expect(screen.getByText(/didn't approve your new account number: Send a cancelled cheque to support/)).toBeTruthy();
    // The form shows what's saved, not the rejected value
    expect(screen.getByLabelText('Account number').props.value).toBe('123456789012');
  });
});
