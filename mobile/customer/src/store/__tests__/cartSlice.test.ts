import reducer, {
  addItem,
  clearCart,
  decrementItem,
  MAX_ITEM_QUANTITY,
  removeItem,
  selectCartCount,
  selectCartSubtotal,
  type CartState,
} from '../cartSlice';

const empty = reducer(undefined, { type: '@@init' });

const add = (menuId: string, id: string, price = 100, restaurantId = 'r1') =>
  addItem({
    restaurantId,
    restaurantName: `Kitchen ${restaurantId}`,
    menuId,
    menuDate: '2026-09-23',
    item: { id, name: `Dish ${id}`, price },
  });

const apply = (...actions: Parameters<typeof reducer>[1][]) =>
  actions.reduce<CartState>((state, action) => reducer(state, action), empty);

describe('cartSlice', () => {
  test('adds items and increments existing lines', () => {
    const state = apply(add('m1', 'a'), add('m1', 'a'), add('m1', 'b', 50));
    expect(state.menuId).toBe('m1');
    expect(state.lines).toEqual([
      { menuItemId: 'a', name: 'Dish a', price: 100, quantity: 2, maxQuantity: MAX_ITEM_QUANTITY },
      { menuItemId: 'b', name: 'Dish b', price: 50, quantity: 1, maxQuantity: MAX_ITEM_QUANTITY },
    ]);
    expect(selectCartCount({ cart: state })).toBe(3);
    expect(selectCartSubtotal({ cart: state })).toBe(250);
  });

  test('starts a fresh cart when adding from a different menu', () => {
    const state = apply(add('m1', 'a'), add('m2', 'x', 80, 'r2'));
    expect(state.menuId).toBe('m2');
    expect(state.restaurantId).toBe('r2');
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0].menuItemId).toBe('x');
  });

  test('caps quantity per item', () => {
    const actions = Array.from({ length: MAX_ITEM_QUANTITY + 5 }, () => add('m1', 'a'));
    expect(apply(...actions).lines[0].quantity).toBe(MAX_ITEM_QUANTITY);
  });

  test("caps quantity at the dish's limit, and adds nothing once the limit is used up", () => {
    const limited = (max: number) =>
      addItem({ restaurantId: 'r1', restaurantName: 'Kitchen r1', menuId: 'm1', menuDate: '2026-09-23', item: { id: 'a', name: 'Dish a', price: 100 }, maxQuantity: max });
    expect(apply(limited(2), limited(2), limited(2)).lines[0]).toMatchObject({ quantity: 2, maxQuantity: 2 });
    expect(apply(limited(0)).lines).toEqual([]);
  });

  test('decrementing the last unit removes the line and resets an empty cart', () => {
    let state = apply(add('m1', 'a'), add('m1', 'b'), decrementItem('a'));
    expect(state.lines.map((l) => l.menuItemId)).toEqual(['b']);

    state = reducer(state, decrementItem('b'));
    expect(state).toEqual(empty);
  });

  test('removeItem and clearCart', () => {
    const state = apply(add('m1', 'a'), add('m1', 'b'), removeItem('a'));
    expect(state.lines.map((l) => l.menuItemId)).toEqual(['b']);
    expect(reducer(state, clearCart())).toEqual(empty);
  });

  test('coerces string prices from the API to numbers', () => {
    const state = reducer(
      empty,
      addItem({
        restaurantId: 'r1',
        restaurantName: 'K',
        menuId: 'm1',
        menuDate: '2026-09-23',
        item: { id: 'a', name: 'A', price: '120.50' as unknown as number },
      })
    );
    expect(state.lines[0].price).toBe(120.5);
  });
});
