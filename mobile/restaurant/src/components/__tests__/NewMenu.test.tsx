import { fireEvent, render, screen } from '@testing-library/react-native';
import { addDays, localDateString } from '@mealdirect/shared';
import NewMenuScreen from '@/app/(app)/menu/new';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('@/lib/useRestaurant', () => ({ useRestaurant: () => ({ id: 'r1' }) }));

const mockCreate = jest.fn();
let mockExisting: { date: string; name: string }[] = [];
jest.mock('@/store/serverApi', () => ({
  useGetMenusQuery: () => ({ data: mockExisting }),
  useCreateMenuMutation: () => [(arg: unknown) => ({ unwrap: () => mockCreate(arg) }), { isLoading: false }],
}));

describe('New menu: ordering window', () => {
  beforeEach(() => {
    mockCreate.mockReset().mockResolvedValue({ id: 'm1' });
    mockExisting = [];
  });
  const today = localDateString(new Date());

  test('overnight: opens the day before, closes on the menu day', async () => {
    await render(<NewMenuScreen />);
    await fireEvent.press(screen.getByText('Tomorrow'));
    await fireEvent.press(screen.getByText('Breakfast'));
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
      name: 'Breakfast',
      date: localDateString(addDays(new Date(), 1)),
      orderingStartTime: '20:00',
      orderingOpensDay: -1,
      orderingEndTime: '06:00',
      orderingClosesDay: 0,
    });
  });

  test('needs a name; a same-day window, and no window at all', async () => {
    await render(<NewMenuScreen />);
    await fireEvent.press(screen.getByText('Create menu'));
    expect(screen.getByText('Name the menu, e.g. Lunch')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Menu name'), ' Lunch – South Indian ');
    await fireEvent.press(screen.getByText('Create menu'));
    expect(mockCreate).toHaveBeenLastCalledWith({ restaurantId: 'r1', name: 'Lunch – South Indian', date: today });

    await fireEvent.changeText(screen.getByLabelText('Opens'), '08:00');
    await fireEvent.changeText(screen.getByLabelText('Closes'), '11:30');
    await fireEvent.press(screen.getByText('Create menu'));
    expect(mockCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderingStartTime: '08:00', orderingOpensDay: 0, orderingEndTime: '11:30', orderingClosesDay: 0 })
    );
  });

  test('a day that has a menu can get another one, but not with the same name', async () => {
    mockExisting = [{ date: today, name: 'Lunch' }];
    await render(<NewMenuScreen />);
    expect(screen.getByText('Today (1)')).toBeTruthy();
    expect(screen.getByText('Today already has Lunch. This adds another menu.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Lunch'));
    await fireEvent.press(screen.getByText('Create menu'));
    expect(screen.getByText('Today already has a menu called Lunch')).toBeTruthy();

    await fireEvent.press(screen.getByText('Dinner'));
    await fireEvent.press(screen.getByText('Create menu'));
    expect(mockCreate).toHaveBeenCalledWith({ restaurantId: 'r1', name: 'Dinner', date: today });
  });
});
