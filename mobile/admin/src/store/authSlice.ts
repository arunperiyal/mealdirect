import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { ApiError, session, toApiError, type AuthResult, type User } from '@mealdirect/shared';
import { authApi } from '@/api';
import { serverApi } from './serverApi';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: User | null;
}

const initialState: AuthState = { status: 'loading', user: null };

const rejectMessage = (error: unknown) => toApiError(error).message;

const startSession = async (result: AuthResult) => {
  if (result.user.role !== 'system_admin') {
    throw new ApiError('WRONG_APP', 'This app is for MealDirect staff only.', 403);
  }
  await session.saveTokens(result);
  await session.saveUser(result.user);
  return result.user;
};

export const bootstrapSession = createAsyncThunk('auth/bootstrap', async () => {
  const [token, cachedUser] = await Promise.all([session.getAccessToken(), session.getUser<User>()]);
  if (!token || !cachedUser) return null;
  return cachedUser;
});

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

// Clears everything user-specific. Used for logout and when the session expires.
export const signOutLocally = createAsyncThunk('auth/signOutLocally', async (_, { dispatch }) => {
  await session.clearSession();
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
      .addCase(signOutLocally.pending, (state) => {
        state.user = null;
        state.status = 'signedOut';
      });
  },
});

export default authSlice.reducer;
