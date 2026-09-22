import { createApi } from '@reduxjs/toolkit/query/react';
import {
  createAxiosBaseQuery,
  type AdminRestaurant,
  type AdminRestaurantDetail,
  type Analytics,
  type Order,
  type VerificationStatus,
} from '@mealdirect/shared';
import { api } from '@/api';

export const serverApi = createApi({
  reducerPath: 'serverApi',
  baseQuery: createAxiosBaseQuery(api),
  tagTypes: ['Restaurant', 'Order', 'Analytics'],
  endpoints: (build) => ({
    getAnalytics: build.query<Analytics, { days: number; tzOffset: number }>({
      query: (params) => ({ url: '/admin/analytics', params }),
      providesTags: ['Analytics'],
    }),

    getRestaurants: build.query<
      { restaurants: AdminRestaurant[]; counts: Record<VerificationStatus, number> },
      { status: VerificationStatus; search?: string }
    >({
      query: ({ status, search }) => ({
        url: '/admin/restaurants',
        params: { status, limit: 100, ...(search ? { search } : {}) },
      }),
      // Per-status counts arrive in the response's meta
      transformResponse: (data: AdminRestaurant[], meta) => ({
        restaurants: data,
        counts: (meta?.counts as Record<VerificationStatus, number>) ?? { pending: 0, verified: 0, rejected: 0 },
      }),
      providesTags: ['Restaurant'],
    }),
    getRestaurant: build.query<AdminRestaurantDetail, string>({
      query: (id) => ({ url: `/admin/restaurants/${id}` }),
      providesTags: (_r, _e, id) => [{ type: 'Restaurant', id }],
    }),
    reviewRestaurant: build.mutation<unknown, { id: string; decision: 'approve' | 'reject'; notes: string }>({
      query: ({ id, decision, notes }) => ({
        url: `/restaurants/admin/${id}/${decision}`,
        method: 'PUT',
        data: { notes },
      }),
      invalidatesTags: ['Restaurant', 'Analytics'],
    }),

    getOrders: build.query<Order[], void>({
      query: () => ({ url: '/orders/admin/orders', params: { limit: 100 } }),
      providesTags: ['Order'],
    }),
    getOrder: build.query<Order, string>({
      query: (id) => ({ url: `/orders/${id}` }),
      providesTags: (_o, _e, id) => [{ type: 'Order', id }],
    }),
    cancelOrder: build.mutation<Order, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/orders/${id}/cancel`, method: 'POST', data: { reason } }),
      invalidatesTags: ['Order', 'Analytics'],
    }),
  }),
});

export const {
  useGetAnalyticsQuery,
  useGetRestaurantsQuery,
  useGetRestaurantQuery,
  useReviewRestaurantMutation,
  useGetOrdersQuery,
  useGetOrderQuery,
  useCancelOrderMutation,
} = serverApi;
