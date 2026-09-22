import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { setSessionExpiredHandler } from '@/api';
import authReducer, { signOutLocally } from './authSlice';
import cartReducer from './cartSlice';
import { serverApi } from './serverApi';

const rootReducer = combineReducers({
  auth: authReducer,
  cart: cartReducer,
  [serverApi.reducerPath]: serverApi.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

export const makeStore = (preloadedState?: Partial<RootState>) =>
  configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefault) => getDefault().concat(serverApi.middleware),
  });

export const store = makeStore();

setSessionExpiredHandler(() => {
  store.dispatch(signOutLocally());
});

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
