import { createApi } from '@reduxjs/toolkit/query/react';
import {
  createAxiosBaseQuery,
  type ChangeResult,
  type Collection,
  type Order,
  type PayoutDetails,
  type RiderCash,
  type RiderProfile,
} from '@mealdirect/shared';
import { api } from '@/api';

export type DeliveryAction = 'claim' | 'release' | 'pick-up' | 'deliver';

export const serverApi = createApi({
  reducerPath: 'serverApi',
  baseQuery: createAxiosBaseQuery(api),
  tagTypes: ['Queue', 'Mine', 'Order', 'Balance', 'Profile'],
  endpoints: (build) => ({
    // Personal and payout details, and any change waiting for MealDirect's review.
    // Works before approval too.
    getProfile: build.query<RiderProfile, void>({
      query: () => ({ url: '/profile' }),
      providesTags: ['Profile'],
    }),
    // Before approval these save at once; after, they wait for review (applied: false)
    updatePersonal: build.mutation<
      ChangeResult & { profile: RiderProfile },
      { firstName: string; lastName: string | null; phone: string }
    >({
      query: (data) => ({ url: '/profile/personal', method: 'PUT', data }),
      invalidatesTags: ['Profile'],
    }),
    updatePayout: build.mutation<ChangeResult & { profile: RiderProfile }, PayoutDetails>({
      query: (data) => ({ url: '/profile/payout', method: 'PUT', data }),
      invalidatesTags: ['Profile'],
    }),
    // Unclaimed delivery orders from every restaurant
    getAvailable: build.query<Order[], void>({
      query: () => ({ url: '/delivery/available' }),
      providesTags: ['Queue'],
    }),
    // This rider's deliveries, newest first
    getMyDeliveries: build.query<Order[], void>({
      query: () => ({ url: '/delivery/orders' }),
      providesTags: ['Mine'],
    }),
    getDelivery: build.query<Order, string>({
      query: (id) => ({ url: `/delivery/orders/${id}` }),
      providesTags: (_o, _e, id) => [{ type: 'Order', id }],
    }),
    // Cash held for MealDirect, and whether it's overdue
    getBalance: build.query<RiderCash, void>({
      query: () => ({ url: '/delivery/balance' }),
      providesTags: ['Balance'],
    }),
    // For pay-on-delivery orders, 'deliver' also records how the customer paid
    act: build.mutation<Order, { id: string; action: DeliveryAction; collection?: Collection; note?: string }>({
      query: ({ id, action, collection, note }) => ({
        url: `/delivery/orders/${id}/${action}`,
        method: 'POST',
        data: collection ? { collection, ...(note ? { note } : {}) } : undefined,
      }),
      invalidatesTags: (_o, _e, { id }) => ['Queue', 'Mine', 'Balance', { type: 'Order', id }],
    }),
  }),
});

export const {
  useGetProfileQuery,
  useUpdatePersonalMutation,
  useUpdatePayoutMutation,
  useGetAvailableQuery,
  useGetMyDeliveriesQuery,
  useGetDeliveryQuery,
  useGetBalanceQuery,
  useActMutation,
} = serverApi;
