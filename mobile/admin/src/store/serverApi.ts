import { createApi } from '@reduxjs/toolkit/query/react';
import {
  createAxiosBaseQuery,
  type AdminChangeRequest,
  type AdminRestaurant,
  type AdminRider,
  type RiderCash,
  type RiderCashDetail,
  type RiderStatus,
  type AdminRestaurantDetail,
  type Analytics,
  type Order,
  type VerificationStatus,
} from '@mealdirect/shared';
import { api } from '@/api';

export const serverApi = createApi({
  reducerPath: 'serverApi',
  baseQuery: createAxiosBaseQuery(api),
  tagTypes: ['Restaurant', 'Order', 'Analytics', 'Rider', 'Cash', 'Change'],
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

    getRiders: build.query<{ riders: AdminRider[]; counts: Record<RiderStatus, number> }, { status: RiderStatus }>({
      query: ({ status }) => ({ url: '/admin/riders', params: { status } }),
      transformResponse: (data: AdminRider[], meta) => ({
        riders: data,
        counts: (meta?.counts as Record<RiderStatus, number>) ?? { pending: 0, approved: 0, suspended: 0 },
      }),
      providesTags: ['Rider'],
    }),
    setRiderStatus: build.mutation<AdminRider, { id: string; action: 'approve' | 'suspend' }>({
      query: ({ id, action }) => ({ url: `/admin/riders/${id}/${action}`, method: 'PUT' }),
      invalidatesTags: ['Rider'],
    }),

    getRiderCash: build.query<RiderCashDetail, string>({
      query: (id) => ({ url: `/admin/riders/${id}/cash` }),
      providesTags: (_r, _e, id) => [{ type: 'Cash', id }],
    }),
    addSettlement: build.mutation<RiderCash, { riderId: string; kind: 'payment' | 'write_off'; amount: number; note?: string }>({
      query: ({ riderId, ...data }) => ({ url: `/admin/riders/${riderId}/settlements`, method: 'POST', data }),
      invalidatesTags: (_r, _e, { riderId }) => [{ type: 'Cash', id: riderId }, 'Rider'],
    }),
    // Cash orders reported as not paid (latest 100)
    getUnpaidOrders: build.query<Order[], void>({
      query: () => ({ url: '/orders/admin/orders', params: { collection: 'not_paid', limit: 100 } }),
      providesTags: ['Order'],
    }),
    resolvePayment: build.mutation<
      Order,
      { id: string; outcome: 'collected' | 'written_off'; method?: 'cash' | 'upi'; note: string }
    >({
      query: ({ id, ...data }) => ({ url: `/admin/orders/${id}/resolve-payment`, method: 'POST', data }),
      invalidatesTags: (_o, _e, { id }) => ['Order', { type: 'Order', id }, 'Analytics'],
    }),

    getOrders: build.query<Order[], void>({
      query: () => ({ url: '/orders/admin/orders', params: { limit: 100 } }),
      providesTags: ['Order'],
    }),
    getOrder: build.query<Order, string>({
      query: (id) => ({ url: `/orders/${id}` }),
      providesTags: (_o, _e, id) => [{ type: 'Order', id }],
    }),
    // Payout and personal detail changes from approved restaurants and riders
    getChangeRequests: build.query<AdminChangeRequest[], void>({
      query: () => ({ url: '/admin/change-requests', params: { status: 'pending' } }),
      providesTags: ['Change'],
    }),
    reviewChange: build.mutation<AdminChangeRequest, { id: string; decision: 'approve' | 'reject'; note?: string }>({
      query: ({ id, decision, note }) => ({
        url: `/admin/change-requests/${id}/${decision}`,
        method: 'POST',
        data: note ? { note } : {},
      }),
      // Approving changes the restaurant's or rider's saved details
      invalidatesTags: ['Change', 'Restaurant', 'Rider', 'Cash'],
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
  useGetRidersQuery,
  useSetRiderStatusMutation,
  useGetRiderCashQuery,
  useAddSettlementMutation,
  useGetUnpaidOrdersQuery,
  useResolvePaymentMutation,
  useGetOrdersQuery,
  useGetOrderQuery,
  useCancelOrderMutation,
  useGetChangeRequestsQuery,
  useReviewChangeMutation,
} = serverApi;
