import reducer, {
  addItem,
  clearCart,
  decrementItem,
  MAX_ITEM_QUANTITY,
  removeItem,
  removeMenu,
  selectCartCount,
  selectCartSubtotal,
  selectQuantity,
  type CartState,
} from '../cartSlice';

const empty = reducer(undefined, { type: '@@init' });

const add = (menuId: string, id: string, price = 100, restaurantId = 'r1') =>
  addItem({
    restaurantId,
    restaurantName: `Kitchen ${restaurantId}`,
    menuId,
    menuName: menuId === 'm1' ? 'Lunch' : 'Dinner',
    menuDate: '2026-09-23',
    item: { id, name: `Dish ${id}`, price },
  });

const apply = (...actions: Parameters<typeof reducer>[1][]) =>
  actions.reduce<CartState>((state, action) => reducer(state, action), empty);

describe('cartSlice', () => {
  test('adds items and increments existing lines', () => {
    const state = apply(add('m1', 'a'), add('m1', 'a'), add('m1', 'b', 50));
    expect(state.menus).toEqual([
      {
        menuId: 'm1',
        menuName: 'Lunch',
        menuDate: '2026-09-23',
        lines: [
          { menuItemId: 'a', name: 'Dish a', price: 100, quantity: 2, maxQuantity: MAX_ITEM_QUANTITY },
          { menuItemId: 'b', name: 'Dish b', price: 50, quantity: 1, maxQuantity: MAX_ITEM_QUANTITY },
        ],
      },
    ]);
    expect(selectCartCount({ cart: state })).toBe(3);
    expect(selectCartSubtotal({ cart: state })).toBe(250);
    expect(selectQuantity({ cart: state }, 'm1', 'a')).toBe(2);
  });

  test("keeps several of a restaurant's menus, each with its own lines", () => {
    const state = apply(add('m1', 'a'), add('m2', 'a', 60), add('m2', 'x', 80));
    expect(state.menus.map((m) => [m.menuName, m.lines.length])).toEqual([
      ['Lunch', 1],
      ['Dinner', 2],
    ]);
    // The same dish id on two menus is two lines
    expect(selectQuantity({ cart: state }, 'm2', 'a')).toBe(1);
    expect(selectCartSubtotal({ cart: state })).toBe(240);
  });

  test('starts a fresh cart when adding from a different restaurant', () => {
    const state = apply(add('m1', 'a'), add('m2', 'x', 80, 'r2'));
    expect(state.restaurantId).toBe('r2');
    expect(state.menus.map((m) => m.menuId)).toEqual(['m2']);
  });

  test('caps quantity per item', () => {
    const actions = Array.from({ length: MAX_ITEM_QUANTITY + 5 }, () => add('m1', 'a'));
    expect(apply(...actions).menus[0].lines[0].quantity).toBe(MAX_ITEM_QUANTITY);
  });

  test("caps quantity at the dish's limit, and adds nothing once the limit is used up", () => {
    const limited = (max: number) =>
      addItem({
        restaurantId: 'r1',
        restaurantName: 'Kitchen r1',
        menuId: 'm1',
        menuName: 'Lunch',
        menuDate: '2026-09-23',
        item: { id: 'a', name: 'Dish a', price: 100 },
        maxQuantity: max,
      });
    expect(apply(limited(2), limited(2), limited(2)).menus[0].lines[0]).toMatchObject({ quantity: 2, maxQuantity: 2 });
    expect(apply(limited(0))).toEqual(empty);
  });

  test('decrementing the last unit removes the line, then the menu, then resets an empty cart', () => {
    let state = apply(add('m1', 'a'), add('m2', 'b'), decrementItem({ menuId: 'm1', menuItemId: 'a' }));
    expect(state.menus.map((m) => m.menuId)).toEqual(['m2']);

    state = reducer(state, decrementItem({ menuId: 'm2', menuItemId: 'b' }));
    expect(state).toEqual(empty);
  });

  test('removeItem, removeMenu and clearCart', () => {
    let state = apply(add('m1', 'a'), add('m1', 'b'), add('m2', 'c'), removeItem({ menuId: 'm1', menuItemId: 'a' }));
    expect(state.menus[0].lines.map((l) => l.menuItemId)).toEqual(['b']);

    state = reducer(state, removeMenu('m1'));
    expect(state.menus.map((m) => m.menuId)).toEqual(['m2']);
    expect(reducer(state, removeMenu('m2'))).toEqual(empty);
    expect(reducer(state, clearCart())).toEqual(empty);
  });

  test('coerces string prices from the API to numbers', () => {
    const state = reducer(
      empty,
      addItem({
        restaurantId: 'r1',
        restaurantName: 'K',
        menuId: 'm1',
        menuName: 'Lunch',
        menuDate: '2026-09-23',
        item: { id: 'a', name: 'A', price: '120.50' as unknown as number },
      })
    );
    expect(state.menus[0].lines[0].price).toBe(120.5);
  });
});
