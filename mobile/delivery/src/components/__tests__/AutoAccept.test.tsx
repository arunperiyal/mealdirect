import { fireEvent, render, screen } from '@testing-library/react-native';
import type { AutoAcceptRule } from '@mealdirect/shared';
import AutoAcceptScreen from '@/app/(app)/auto-accept';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockAdd = jest.fn();
const mockLimit = jest.fn();
const mockUpdate = jest.fn();
const mockRules: AutoAcceptRule[] = [
  {
    id: 'r1',
    restaurantId: 'rest1',
    restaurant: { id: 'rest1', name: 'Annapurna Mess', city: 'Pune' },
    startTime: '12:00',
    endTime: '14:00',
    enabled: true,
    createdAt: '2026-10-01T10:00:00Z',
  },
];
const mutation = (fn: jest.Mock) => () => [(arg: unknown) => ({ unwrap: () => fn(arg) }), { isLoading: false }];

jest.mock('@/store/serverApi', () => ({
  useGetRulesQuery: () => ({ data: mockRules, isLoading: false, isFetching: false, refetch: jest.fn() }),
  useAddRuleMutation: () => mutation(mockAdd)(),
  useUpdateRuleMutation: () => mutation(mockUpdate)(),
  useDeleteRuleMutation: () => mutation(jest.fn())(),
  useGetAutoAcceptSettingsQuery: () => ({ data: { limit: 10, maxLimit: 20, defaultLimit: 10 } }),
  useSetAutoAcceptLimitMutation: () => mutation(mockLimit)(),
  useSearchRestaurantsQuery: () => ({
    data: [{ id: 'rest2', name: 'Sai Tiffins', city: 'Pune', deliveryEnabled: true }],
    isFetching: false,
  }),
}));

describe('AutoAcceptScreen', () => {
  beforeEach(() => {
    mockAdd.mockReset().mockResolvedValue({});
    mockUpdate.mockReset().mockResolvedValue({});
    mockLimit.mockReset().mockResolvedValue({});
  });

  test('the rider sets how many deliveries rules may give them', async () => {
    await render(<AutoAcceptScreen />);
    expect(screen.getByText('Up to 10 at a time')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('More deliveries'));
    expect(mockLimit).toHaveBeenCalledWith(11);
    await fireEvent.press(screen.getByLabelText('Fewer deliveries'));
    expect(mockLimit).toHaveBeenLastCalledWith(9);
  });

  test('lists rules and pauses one', async () => {
    await render(<AutoAcceptScreen />);
    expect(screen.getByText('Annapurna Mess')).toBeTruthy();
    expect(screen.getByText('Deliveries due 12:00 PM – 2:00 PM')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Auto-accept Annapurna Mess 12:00 PM – 2:00 PM'), 'valueChange', false);
    expect(mockUpdate).toHaveBeenCalledWith({ id: 'r1', enabled: false });
  });

  test('adds a rule for a restaurant and a time window', async () => {
    await render(<AutoAcceptScreen />);
    await fireEvent.press(screen.getByText('Add a rule'));
    await fireEvent.press(screen.getByText('Save rule'));
    expect(screen.getByText('Choose a restaurant')).toBeTruthy();

    await fireEvent.press(screen.getByText('Sai Tiffins'));
    await fireEvent.changeText(screen.getByLabelText('From'), '19:00');
    await fireEvent.changeText(screen.getByLabelText('Until'), '9:00');
    await fireEvent.press(screen.getByText('Save rule'));
    expect(screen.getByText('The end time must be after the start time')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Until'), '21:30');
    await fireEvent.press(screen.getByText('Save rule'));
    expect(mockAdd).toHaveBeenCalledWith({ restaurantId: 'rest2', startTime: '19:00', endTime: '21:30' });
  });
});
