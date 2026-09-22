import axios, {
  isAxiosError,
  AxiosAdapter,
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  code?: string;
  message?: string;
  errors?: { path?: string; msg?: string }[];
}

// Normalize axios/backend errors into { code, message, status } for the UI
export const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error;

  if (isAxiosError(error)) {
    if (!error.response) {
      return new ApiError('NETWORK_ERROR', 'Cannot reach the server. Check your connection.', 0);
    }
    const { status } = error.response;
    const body = (error.response.data || {}) as ErrorBody;
    const firstField = body.errors?.[0];
    const fieldMessage =
      firstField &&
      (firstField.msg && firstField.msg !== 'Invalid value'
        ? firstField.msg
        : `Invalid ${firstField.path ?? 'input'}`);

    return new ApiError(
      body.code || 'HTTP_ERROR',
      body.message || fieldMessage || `Request failed (${status})`,
      status
    );
  }

  const message = error instanceof Error ? error.message : 'Something went wrong';
  return new ApiError('UNKNOWN', message, 0);
};

export interface TokenStore {
  getAccessToken: () => Promise<string | null>;
  getRefreshToken: () => Promise<string | null>;
  setAccessToken: (token: string) => Promise<void>;
  clearTokens: () => Promise<void>;
}

interface ClientOptions {
  baseURL: string;
  tokenStore: TokenStore;
  onSessionExpired: () => void;
  adapter?: AxiosAdapter; // injectable for tests
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

export const createApiClient = ({
  baseURL,
  tokenStore,
  onSessionExpired,
  adapter,
}: ClientOptions): AxiosInstance => {
  const client = axios.create({ baseURL: `${baseURL}/api`, timeout: 15000, adapter });

  // One refresh at a time: concurrent 401s wait on the same promise
  let refreshing: Promise<string | null> | null = null;

  // Resolves to a new access token, or null when the session is no longer valid.
  // Network failures reject so a flaky connection doesn't log the user out.
  const refreshAccessToken = () => {
    if (!refreshing) {
      refreshing = (async () => {
        const refreshToken = await tokenStore.getRefreshToken();
        if (!refreshToken) return null;
        try {
          const res = await axios.post(
            `${baseURL}/api/auth/refresh`,
            { refreshToken },
            { adapter, timeout: 15000 }
          );
          const token: string = res.data.data.accessToken;
          await tokenStore.setAccessToken(token);
          return token;
        } catch (error) {
          if (isAxiosError(error) && error.response) return null;
          throw error;
        }
      })().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  };

  const expireSession = async () => {
    await tokenStore.clearTokens();
    onSessionExpired();
  };

  client.interceptors.request.use(async (config) => {
    if (!config.headers.Authorization) {
      const token = await tokenStore.getAccessToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(undefined, async (error: AxiosError<ErrorBody>) => {
    const config = error.config as RetriableConfig | undefined;
    const sentToken = Boolean(config?.headers?.Authorization);

    // 401 without a token (e.g. wrong password on login) is a normal error
    if (error.response?.status !== 401 || !config || !sentToken) {
      throw toApiError(error);
    }

    if (error.response.data?.code === 'TOKEN_EXPIRED' && !config._retried) {
      let token: string | null;
      try {
        token = await refreshAccessToken();
      } catch (refreshError) {
        throw toApiError(refreshError);
      }
      if (token) {
        config._retried = true;
        config.headers.Authorization = `Bearer ${token}`;
        return client(config);
      }
    }

    await expireSession();
    throw new ApiError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.', 401);
  });

  return client;
};
