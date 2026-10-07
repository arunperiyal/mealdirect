import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { MAX_ITEM_QUANTITY, type MenuItem } from '@mealdirect/shared';

export interface CartLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  // The dish's limit for this customer when it was added (see dishAllowance)
  maxQuantity: number;
}

// Dishes from one of the restaurant's menus. Each menu becomes its own order at checkout:
// menus have their own ordering times and delivery times.
export interface CartMenu {
  menuId: string;
  menuName: string;
  menuDate: string;
  lines: CartLine[];
}

// One restaurant at a time, but any number of its menus (lunch and dinner, today and tomorrow)
export interface CartState {
  restaurantId: string | null;
  restaurantName: string | null;
  menus: CartMenu[];
}

const initialState: CartState = {
  restaurantId: null,
  restaurantName: null,
  menus: [],
};

export interface AddItemPayload {
  restaurantId: string;
  restaurantName: string;
  menuId: string;
  menuName: string;
  menuDate: string;
  item: Pick<MenuItem, 'id' | 'name' | 'price'>;
  maxQuantity?: number; // defaults to the 20 per order every dish has
}

export interface LineRef {
  menuId: string;
  menuItemId: string;
}

// Drops a line, then a menu left without lines. Immer forbids changing the draft and also
// returning a new state, so emptying the cart returns the empty state without touching it.
const removeLine = (state: CartState, { menuId, menuItemId }: LineRef) => {
  const menus = state.menus
    .map((m) => (m.menuId === menuId ? { ...m, lines: m.lines.filter((l) => l.menuItemId !== menuItemId) } : m))
    .filter((m) => m.lines.length > 0);
  if (!menus.length) return initialState;
  state.menus = menus;
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    // Callers must confirm with the user before adding from a different restaurant;
    // this reducer then starts a fresh cart for it
    addItem(state, { payload }: PayloadAction<AddItemPayload>) {
      const maxQuantity = payload.maxQuantity ?? MAX_ITEM_QUANTITY;
      if (maxQuantity < 1) return;
      if (state.restaurantId !== payload.restaurantId) {
        Object.assign(state, { restaurantId: payload.restaurantId, restaurantName: payload.restaurantName, menus: [] });
      }
      let menu = state.menus.find((m) => m.menuId === payload.menuId);
      if (!menu) {
        menu = { menuId: payload.menuId, menuName: payload.menuName, menuDate: payload.menuDate, lines: [] };
        state.menus.push(menu);
      }
      const line = menu.lines.find((l) => l.menuItemId === payload.item.id);
      if (line) {
        line.maxQuantity = maxQuantity;
        line.quantity = Math.min(line.quantity + 1, maxQuantity);
      } else {
        menu.lines.push({
          menuItemId: payload.item.id,
          name: payload.item.name,
          price: Number(payload.item.price),
          quantity: 1,
          maxQuantity,
        });
      }
    },

    decrementItem(state, { payload }: PayloadAction<LineRef>) {
      const line = state.menus.find((m) => m.menuId === payload.menuId)?.lines.find((l) => l.menuItemId === payload.menuItemId);
      if (!line) return;
      if (line.quantity > 1) {
        line.quantity -= 1;
        return;
      }
      return removeLine(state, payload);
    },

    removeItem: (state, { payload }: PayloadAction<LineRef>) => removeLine(state, payload),

    // A menu's order was placed
    removeMenu(state, { payload: menuId }: PayloadAction<string>) {
      const menus = state.menus.filter((m) => m.menuId !== menuId);
      if (!menus.length) return initialState;
      state.menus = menus;
    },

    clearCart: () => initialState,
  },
});

export const { addItem, decrementItem, removeItem, removeMenu, clearCart } = cartSlice.actions;
export { MAX_ITEM_QUANTITY };
export default cartSlice.reducer;

export const menuSubtotal = (menu: CartMenu) => menu.lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

export const selectCartCount = (state: { cart: CartState }) =>
  state.cart.menus.reduce((sum, m) => sum + m.lines.reduce((n, l) => n + l.quantity, 0), 0);

export const selectCartSubtotal = (state: { cart: CartState }) =>
  state.cart.menus.reduce((sum, m) => sum + menuSubtotal(m), 0);

// How many of a dish from a menu are in the cart
export const selectQuantity = (state: { cart: CartState }, menuId: string, menuItemId: string) =>
  state.cart.menus.find((m) => m.menuId === menuId)?.lines.find((l) => l.menuItemId === menuItemId)?.quantity ?? 0;
