import { createApi, BaseQueryFn } from '@reduxjs/toolkit/query/react';
import type { AxiosRequestConfig } from 'axios';
import { api, toApiError } from '@/api';
import type {
  CreateOrderInput,
  DeliverySlot,
  Menu,
  Order,
  PaymentOrder,
  RazorpaySuccess,
  Restaurant,
} from '@/api/types';

interface Request {
  url: string;
  method?: AxiosRequestConfig['method'];
  data?: unknown;
  params?: Record<string, unknown>;
}

export interface QueryError {
  code: string;
  message: string;
  status: number;
}

// Runs requests through the shared axios client (auth header + token refresh)
// and unwraps the backend's { success, data } envelope
const axiosBaseQuery: BaseQueryFn<Request, unknown, QueryError> = async ({
  url,
  method = 'GET',
  data,
  params,
}) => {
  try {
    const res = await api.request({ url, method, data, params });
    return { data: res.data.data };
  } catch (error) {
    const { code, message, status } = toApiError(error);
    return { error: { code, message, status } };
  }
};

export const serverApi = createApi({
  reducerPath: 'serverApi',
  baseQuery: axiosBaseQuery,
  tagTypes: ['Order'],
  endpoints: (build) => ({
    getRestaurants: build.query<Restaurant[], { search?: string }>({
      // Without isApproved=true the backend returns only unapproved restaurants
      query: ({ search }) => ({
        url: '/restaurants',
        params: { isApproved: true, limit: 50, ...(search ? { search } : {}) },
      }),
    }),

    getRestaurant: build.query<Restaurant, string>({
      query: (id) => ({ url: `/restaurants/${id}` }),
    }),

    // The backend ignores status filters on this endpoint, so filter here
    getPublishedMenus: build.query<Menu[], { restaurantId: string; date: string }>({
      query: ({ restaurantId, date }) => ({ url: '/menus', params: { restaurantId, date } }),
      transformResponse: (menus: Menu[]) => menus.filter((m) => m.status === 'published'),
    }),

    getMenuSlots: build.query<DeliverySlot[], string>({
      query: (menuId) => ({ url: `/menus/${menuId}/slots` }),
    }),

    getMyOrders: build.query<Order[], void>({
      query: () => ({ url: '/orders', params: { limit: 50 } }),
      providesTags: (orders = []) => [
        { type: 'Order', id: 'LIST' },
        ...orders.map((o) => ({ type: 'Order' as const, id: o.id })),
      ],
    }),

    getOrder: build.query<Order, string>({
      query: (id) => ({ url: `/orders/${id}` }),
      providesTags: (_order, _error, id) => [{ type: 'Order', id }],
    }),

    createOrder: build.mutation<Order, CreateOrderInput>({
      query: (data) => ({ url: '/orders', method: 'POST', data }),
      invalidatesTags: [{ type: 'Order', id: 'LIST' }],
    }),

    cancelOrder: build.mutation<Order, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({ url: `/orders/${id}/cancel`, method: 'POST', data: { reason } }),
      invalidatesTags: (_order, _error, { id }) => [
        { type: 'Order', id },
        { type: 'Order', id: 'LIST' },
      ],
    }),

    markPickedUp: build.mutation<Order, string>({
      query: (id) => ({ url: `/orders/${id}/mark-picked-up`, method: 'POST' }),
      invalidatesTags: (_order, _error, id) => [
        { type: 'Order', id },
        { type: 'Order', id: 'LIST' },
      ],
    }),

    createPaymentOrder: build.mutation<PaymentOrder, string>({
      query: (orderId) => ({ url: '/payments/create-order', method: 'POST', data: { orderId } }),
    }),

    verifyPayment: build.mutation<{ order: Order }, RazorpaySuccess & { orderId: string }>({
      query: ({ orderId: _orderId, ...data }) => ({
        url: '/payments/verify-payment',
        method: 'POST',
        data,
      }),
      invalidatesTags: (_result, _error, { orderId }) => [
        { type: 'Order', id: orderId },
        { type: 'Order', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetRestaurantsQuery,
  useGetRestaurantQuery,
  useGetPublishedMenusQuery,
  useGetMenuSlotsQuery,
  useGetMyOrdersQuery,
  useGetOrderQuery,
  useCreateOrderMutation,
  useCancelOrderMutation,
  useMarkPickedUpMutation,
  useCreatePaymentOrderMutation,
  useVerifyPaymentMutation,
} = serverApi;
