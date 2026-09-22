import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { toApiError } from './client';

export interface Request {
  url: string;
  method?: AxiosRequestConfig['method'];
  data?: unknown;
  params?: Record<string, unknown>;
}

// The backend's `meta` block (totals, per-status counts, ...), when a list endpoint sends one
export type ResponseMeta = Record<string, unknown>;

export interface QueryError {
  code: string;
  message: string;
  status: number;
}

// RTK Query base query over the shared axios client (auth header + token
// refresh) that unwraps the backend's { success, data } envelope
export const createAxiosBaseQuery =
  (client: AxiosInstance): BaseQueryFn<Request, unknown, QueryError, object, ResponseMeta> =>
  async ({ url, method = 'GET', data, params }) => {
    try {
      const res = await client.request({ url, method, data, params });
      return { data: res.data.data, meta: res.data.meta ?? {} };
    } catch (error) {
      const { code, message, status } = toApiError(error);
      return { error: { code, message, status } };
    }
  };
