import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { authApi, ApiError, toApiError } from '@/api';
import * as session from '@/api/tokens';
import type { AuthResult, User } from '@/api/types';
import { clearCart } from './cartSlice';
import { serverApi } from './serverApi';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: User | null;
}

const initialState: AuthState = { status: 'loading', user: null };

const rejectMessage = (error: unknown) => toApiError(error).message;

const startSession = async (result: AuthResult) => {
  // Restaurant and system admins have their own apps
  if (result.user.role !== 'customer') {
    throw new ApiError('WRONG_APP', 'This app is for customers. Please use the MealDirect partner app.', 403);
  }
  await session.saveTokens(result);
  await session.saveUser(result.user);
  return result.user;
};

export const bootstrapSession = createAsyncThunk('auth/bootstrap', async () => {
  const [token, cachedUser] = await Promise.all([
    session.getAccessToken(),
    session.getUser<User>(),
  ]);
  if (!token || !cachedUser) return null;
  return cachedUser;
});

// Refresh the cached profile in the background after startup
export const refreshProfile = createAsyncThunk('auth/refreshProfile', async () => {
  const user = await authApi.me();
  await session.saveUser(user);
  return user;
});

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      return await startSession(await authApi.login(email, password));
    } catch (error) {
      await session.clearSession();
      return rejectWithValue(rejectMessage(error));
    }
  }
);

export const register = createAsyncThunk(
  'auth/register',
  async (
    input: { email: string; password: string; firstName: string; lastName: string },
    { rejectWithValue }
  ) => {
    try {
      return await startSession(await authApi.register(input));
    } catch (error) {
      await session.clearSession();
      return rejectWithValue(rejectMessage(error));
    }
  }
);

// Clears everything user-specific. Used for logout and when the session expires.
export const signOutLocally = createAsyncThunk('auth/signOutLocally', async (_, { dispatch }) => {
  await session.clearSession();
  dispatch(clearCart());
  dispatch(serverApi.util.resetApiState());
});

export const logout = createAsyncThunk('auth/logout', async (_, { dispatch }) => {
  try {
    await authApi.logout();
  } catch {
    // Logging out locally matters more than telling the server
  }
  await dispatch(signOutLocally());
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapSession.fulfilled, (state, { payload }) => {
        state.user = payload;
        state.status = payload ? 'signedIn' : 'signedOut';
      })
      .addCase(bootstrapSession.rejected, (state) => {
        state.status = 'signedOut';
      })
      .addCase(refreshProfile.fulfilled, (state, { payload }) => {
        if (state.status === 'signedIn') state.user = payload;
      })
      .addCase(login.fulfilled, (state, { payload }) => {
        state.user = payload;
        state.status = 'signedIn';
      })
      .addCase(register.fulfilled, (state, { payload }) => {
        state.user = payload;
        state.status = 'signedIn';
      })
      .addCase(signOutLocally.pending, (state) => {
        state.user = null;
        state.status = 'signedOut';
      });
  },
});

export default authSlice.reducer;
