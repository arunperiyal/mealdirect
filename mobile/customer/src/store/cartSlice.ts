import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { MenuItem } from '@/api/types';

export interface CartLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

// An order belongs to exactly one restaurant menu, so the cart does too
export interface CartState {
  restaurantId: string | null;
  restaurantName: string | null;
  menuId: string | null;
  menuDate: string | null;
  lines: CartLine[];
}

const initialState: CartState = {
  restaurantId: null,
  restaurantName: null,
  menuId: null,
  menuDate: null,
  lines: [],
};

export interface AddItemPayload {
  restaurantId: string;
  restaurantName: string;
  menuId: string;
  menuDate: string;
  item: Pick<MenuItem, 'id' | 'name' | 'price'>;
}

const MAX_QUANTITY = 20;

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    // Callers must confirm with the user before adding from a different menu;
    // this reducer then starts a fresh cart for that menu.
    addItem(state, { payload }: PayloadAction<AddItemPayload>) {
      if (state.menuId !== payload.menuId) {
        Object.assign(state, {
          restaurantId: payload.restaurantId,
          restaurantName: payload.restaurantName,
          menuId: payload.menuId,
          menuDate: payload.menuDate,
          lines: [],
        });
      }
      const line = state.lines.find((l) => l.menuItemId === payload.item.id);
      if (line) {
        line.quantity = Math.min(line.quantity + 1, MAX_QUANTITY);
      } else {
        state.lines.push({
          menuItemId: payload.item.id,
          name: payload.item.name,
          price: Number(payload.item.price),
          quantity: 1,
        });
      }
    },

    // Immer forbids mutating the draft and also returning a new state,
    // so the "cart is now empty" case returns early without touching the draft
    decrementItem(state, { payload: menuItemId }: PayloadAction<string>) {
      const line = state.lines.find((l) => l.menuItemId === menuItemId);
      if (!line) return;
      if (line.quantity > 1) {
        line.quantity -= 1;
        return;
      }
      if (state.lines.length === 1) return initialState;
      state.lines = state.lines.filter((l) => l.menuItemId !== menuItemId);
    },

    removeItem(state, { payload: menuItemId }: PayloadAction<string>) {
      const remaining = state.lines.filter((l) => l.menuItemId !== menuItemId);
      if (remaining.length === 0) return initialState;
      state.lines = remaining;
    },

    clearCart: () => initialState,
  },
});

export const { addItem, decrementItem, removeItem, clearCart } = cartSlice.actions;
export const MAX_ITEM_QUANTITY = MAX_QUANTITY;
export default cartSlice.reducer;

export const selectCartCount = (state: { cart: CartState }) =>
  state.cart.lines.reduce((sum, l) => sum + l.quantity, 0);

export const selectCartSubtotal = (state: { cart: CartState }) =>
  state.cart.lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
