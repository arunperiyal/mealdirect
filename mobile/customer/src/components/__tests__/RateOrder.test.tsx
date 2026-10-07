import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Order } from '@mealdirect/shared';
import { RateOrder } from '@/components/RateOrder';

const mockRate = jest.fn();
jest.mock('@/store/serverApi', () => ({
  useRateOrderMutation: () => [(arg: unknown) => ({ unwrap: () => mockRate(arg) }), { isLoading: false }],
}));

const delivered = (overrides: Partial<Order> = {}) =>
  ({
    id: 'o1',
    restaurantId: 'r1',
    status: 'delivered',
    deliveredAt: new Date().toISOString(),
    riderId: 'rider1',
    rating: null,
    ...overrides,
  }) as Order;

describe('RateOrder', () => {
  beforeEach(() => mockRate.mockReset().mockResolvedValue({}));

  test('rates the food and the delivery', async () => {
    await render(<RateOrder order={delivered()} />);
    await fireEvent.press(screen.getByText('Submit rating'));
    expect(screen.getByText('Choose how many stars for the food')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Food: 4 stars, Good'));
    await fireEvent.changeText(screen.getByLabelText('Comment for the restaurant (optional)'), ' Lovely ');
    await fireEvent.press(screen.getByLabelText('Delivery: 5 stars, Excellent'));
    await fireEvent.press(screen.getByText('Submit rating'));
    expect(mockRate).toHaveBeenCalledWith({
      id: 'o1',
      restaurantId: 'r1',
      foodRating: 4,
      foodComment: 'Lovely',
      deliveryRating: 5,
      deliveryComment: null,
    });
  });

  test('pickup orders rate only the food', async () => {
    await render(<RateOrder order={delivered({ status: 'picked_up', riderId: null })} />);
    expect(screen.queryByText('Delivery')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Food: 5 stars, Excellent'));
    await fireEvent.press(screen.getByText('Submit rating'));
    expect(mockRate).toHaveBeenCalledWith({ id: 'o1', restaurantId: 'r1', foodRating: 5, foodComment: null });
  });

  test('shows the rating once given; no editing after 7 days; nothing for active orders', async () => {
    const rating = { foodRating: 3, foodComment: 'Bit salty', deliveryRating: null, deliveryComment: null, createdAt: '', updatedAt: '' };
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const { rerender } = await render(<RateOrder order={delivered({ rating, deliveredAt: old })} />);
    expect(screen.getByText('“Bit salty”')).toBeTruthy();
    expect(screen.queryByText('Edit rating')).toBeNull();

    await rerender(<RateOrder order={delivered({ rating: null, deliveredAt: old })} />);
    expect(screen.queryByText('How was it?')).toBeNull();
    await rerender(<RateOrder order={delivered({ status: 'out_for_delivery', deliveredAt: null })} />);
    expect(screen.queryByText('How was it?')).toBeNull();
  });
});
