import { makeStore } from '@/store';
import { login } from '../authSlice';

jest.mock('@mealdirect/shared', () => ({
  ...jest.requireActual('@mealdirect/shared'),
  session: {
    saveTokens: jest.fn(async () => {}),
    saveUser: jest.fn(async () => {}),
    clearSession: jest.fn(async () => {}),
    clearTokens: jest.fn(async () => {}),
    getAccessToken: jest.fn(async () => null),
    getRefreshToken: jest.fn(async () => null),
    setAccessToken: jest.fn(async () => {}),
    getUser: jest.fn(async () => null),
  },
}));

jest.mock('@/api', () => {
  const actual = jest.requireActual('@/api');
  return { ...actual, authApi: { ...actual.authApi, login: jest.fn() } };
});

const { authApi } = jest.requireMock('@/api') as { authApi: { login: jest.Mock } };
const tokens = jest.requireMock('@mealdirect/shared').session as Record<string, jest.Mock>;

const result = (role: string) => ({
  user: { id: 'u1', email: 'a@b.co', firstName: 'A', lastName: 'B', phone: null, role },
  accessToken: 'access',
  refreshToken: 'refresh',
});

describe('login', () => {
  beforeEach(() => jest.clearAllMocks());

  test('signs in customers and stores their tokens', async () => {
    authApi.login.mockResolvedValue(result('customer'));
    const store = makeStore();

    await store.dispatch(login({ email: 'a@b.co', password: 'password1' })).unwrap();

    expect(store.getState().auth).toMatchObject({ status: 'signedIn', user: { id: 'u1' } });
    expect(tokens.saveTokens).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'access' }));
  });

  test('refuses restaurant and system admins without keeping their tokens', async () => {
    authApi.login.mockResolvedValue(result('system_admin'));
    const store = makeStore();

    const action = await store.dispatch(login({ email: 'a@b.co', password: 'password1' }));

    expect(action.payload).toMatch(/for customers/);
    expect(store.getState().auth.status).not.toBe('signedIn');
    expect(tokens.saveTokens).not.toHaveBeenCalled();
    expect(tokens.clearSession).toHaveBeenCalled();
  });
});
