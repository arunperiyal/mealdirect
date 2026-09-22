import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Which of the owner's restaurants the app is showing. null means "the first one".
const restaurantSlice = createSlice({
  name: 'restaurant',
  initialState: { selectedId: null as string | null },
  reducers: {
    selectRestaurant(state, { payload }: PayloadAction<string | null>) {
      state.selectedId = payload;
    },
  },
});

export const { selectRestaurant } = restaurantSlice.actions;
export default restaurantSlice.reducer;
