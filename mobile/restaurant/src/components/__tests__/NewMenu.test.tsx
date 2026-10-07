import { fireEvent, render, screen } from '@testing-library/react-native';
import { addDays, localDateString } from '@mealdirect/shared';
import NewMenuScreen from '@/app/(app)/menu/new';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('@/lib/useRestaurant', () => ({ useRestaurant: () => ({ id: 'r1' }) }));

const mockCreate = jest.fn();
jest.mock('@/store/serverApi', () => ({
  useGetMenusQuery: () => ({ data: [] }),
  useCreateMenuMutation: () => [(arg: unknown) => ({ unwrap: () => mockCreate(arg) }), { isLoading: false }],
}));

describe('New menu: ordering window', () => {
  beforeEach(() => mockCreate.mockReset().mockResolvedValue({ id: 'm1' }));
  const today = localDateString(new Date());

  test('overnight: opens the day before, closes on the menu day', async () => {
    await render(<NewMenuScreen />);
    await fireEvent.press(screen.getByText('Tomorrow'));
    await fireEvent.changeText(screen.getByLabelText('Opens'), '20:00');
    await fireEvent.changeText(screen.getByLabelText('Closes'), '06:00');
    await fireEvent.press(screen.getByText('Create menu'));
    expect(screen.getByText('Must be after it opens. For overnight ordering, open it the day before.')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();

    // The "Opens" day choice for tomorrow's menu: today, the day before
    await fireEvent.press(screen.getAllByText('Today (day before)')[0]);
    expect(screen.getByText('Orders open today at 20:00 and close tomorrow at 06:00.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Create menu'));
    expect(mockCreate).toHaveBeenCalledWith({
      restaurantId: 'r1',
      date: localDateString(addDays(new Date(), 1)),
      orderingStartTime: '20:00',
      orderingOpensDay: -1,
      orderingEndTime: '06:00',
      orderingClosesDay: 0,
    });
  });

  test('a same-day window, and no window at all', async () => {
    await render(<NewMenuScreen />);
    await fireEvent.press(screen.getByText('Create menu'));
    expect(mockCreate).toHaveBeenLastCalledWith({ restaurantId: 'r1', date: today });

    await fireEvent.changeText(screen.getByLabelText('Opens'), '08:00');
    await fireEvent.changeText(screen.getByLabelText('Closes'), '11:30');
    await fireEvent.press(screen.getByText('Create menu'));
    expect(mockCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderingStartTime: '08:00', orderingOpensDay: 0, orderingEndTime: '11:30', orderingClosesDay: 0 })
    );
  });

});
