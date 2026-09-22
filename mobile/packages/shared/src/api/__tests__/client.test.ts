import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { ApiError, createApiClient, type TokenStore } from '../client';

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };

// Fake transport: routes each request to a handler and records what was sent
const makeAdapter = (handler: Handler) => {
  const calls: { url: string; auth?: string }[] = [];
  const adapter: AxiosAdapter = async (config) => {
    const url = `${config.baseURL ?? ''}${config.url ?? ''}`.replace('http://api.test', '');
    calls.push({ url, auth: config.headers?.Authorization as string | undefined });
    const { status, data } = handler(config);
    const response = { status, data, statusText: '', headers: {}, config, request: {} };
    if (status >= 400) {
      throw new AxiosError('Request failed', String(status), config, {}, response);
    }
    return response;
  };
  return { adapter, calls };
};

const makeTokens = (access: string | null, refresh: string | null) => {
  const state = { access, refresh };
  const store: TokenStore = {
    getAccessToken: async () => state.access,
    getRefreshToken: async () => state.refresh,
    setAccessToken: async (t) => {
      state.access = t;
    },
    clearTokens: async () => {
      state.access = null;
      state.refresh = null;
    },
  };
  return { store, state };
};

const expired = { status: 401, data: { code: 'TOKEN_EXPIRED', message: 'Token expired' } };

describe('createApiClient', () => {
  test('attaches the stored access token', async () => {
    const { adapter, calls } = makeAdapter(() => ({ status: 200, data: { data: 'ok' } }));
    const { store } = makeTokens('access-1', 'refresh-1');
    const client = createApiClient({ baseURL: 'http://api.test', tokenStore: store, onSessionExpired: jest.fn(), adapter });

    await client.get('/orders');
    expect(calls[0]).toEqual({ url: '/api/orders', auth: 'Bearer access-1' });
  });

  test('refreshes an expired token once and retries the request', async () => {
    const { adapter, calls } = makeAdapter((config) => {
      if (config.url?.endsWith('/auth/refresh')) return { status: 200, data: { data: { accessToken: 'access-2' } } };
      return config.headers.Authorization === 'Bearer access-2' ? { status: 200, data: { data: 'ok' } } : expired;
    });
    const { store, state } = makeTokens('access-1', 'refresh-1');
    const onSessionExpired = jest.fn();
    const client = createApiClient({ baseURL: 'http://api.test', tokenStore: store, onSessionExpired, adapter });

    const res = await client.get('/orders');

    expect(res.data.data).toBe('ok');
    expect(state.access).toBe('access-2');
    expect(calls.map((c) => c.url)).toEqual(['/api/orders', '/api/auth/refresh', '/api/orders']);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  test('concurrent 401s share a single refresh', async () => {
    const { adapter, calls } = makeAdapter((config) => {
      if (config.url?.endsWith('/auth/refresh')) return { status: 200, data: { data: { accessToken: 'access-2' } } };
      return config.headers.Authorization === 'Bearer access-2' ? { status: 200, data: {} } : expired;
    });
    const { store } = makeTokens('access-1', 'refresh-1');
    const client = createApiClient({ baseURL: 'http://api.test', tokenStore: store, onSessionExpired: jest.fn(), adapter });

    await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);

    expect(calls.filter((c) => c.url === '/api/auth/refresh')).toHaveLength(1);
  });

  test('expires the session when the refresh token is rejected', async () => {
    const { adapter } = makeAdapter((config) =>
      config.url?.endsWith('/auth/refresh') ? { status: 401, data: { code: 'INVALID_REFRESH_TOKEN' } } : expired
    );
    const { store, state } = makeTokens('access-1', 'refresh-1');
    const onSessionExpired = jest.fn();
    const client = createApiClient({ baseURL: 'http://api.test', tokenStore: store, onSessionExpired, adapter });

    await expect(client.get('/orders')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(state).toEqual({ access: null, refresh: null });
  });

  test('a network failure during refresh does not log the user out', async () => {
    const adapter: AxiosAdapter = async (config) => {
      if (config.url?.endsWith('/auth/refresh')) {
        throw new AxiosError('Network Error', 'ERR_NETWORK', config);
      }
      throw new AxiosError('x', '401', config, {}, {
        ...expired,
        statusText: '',
        headers: {},
        config,
      });
    };
    const { store, state } = makeTokens('access-1', 'refresh-1');
    const onSessionExpired = jest.fn();
    const client = createApiClient({ baseURL: 'http://api.test', tokenStore: store, onSessionExpired, adapter });

    await expect(client.get('/orders')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(state.refresh).toBe('refresh-1');
  });

  test('a 401 on an unauthenticated request (bad login) is a normal error', async () => {
    const { adapter } = makeAdapter(() => ({
      status: 401,
      data: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    }));
    const { store } = makeTokens(null, null);
    const onSessionExpired = jest.fn();
    const client = createApiClient({ baseURL: 'http://api.test', tokenStore: store, onSessionExpired, adapter });

    const error = await client.post('/auth/login', {}).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password', status: 401 });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  test('turns express-validator errors into a readable message', async () => {
    const { adapter } = makeAdapter(() => ({
      status: 400,
      data: { code: 'VALIDATION_ERROR', errors: [{ path: 'deliveryAddress', msg: 'Invalid value' }] },
    }));
    const { store } = makeTokens('a', 'r');
    const client = createApiClient({ baseURL: 'http://api.test', tokenStore: store, onSessionExpired: jest.fn(), adapter });

    await expect(client.post('/orders', {})).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Invalid deliveryAddress',
    });
  });
});

