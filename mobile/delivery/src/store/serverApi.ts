import { createApi } from '@reduxjs/toolkit/query/react';
import { createAxiosBaseQuery, type AppConfig, type Collection, type Order, type RiderCash } from '@mealdirect/shared';
import { api } from '@/api';

export type DeliveryAction = 'claim' | 'release' | 'pick-up' | 'deliver';

export const serverApi = createApi({
  reducerPath: 'serverApi',
  baseQuery: createAxiosBaseQuery(api),
  tagTypes: ['Queue', 'Mine', 'Order', 'Balance'],
  endpoints: (build) => ({
    // MealDirect's UPI details for the QR shown at the door
    getConfig: build.query<AppConfig, void>({
      query: () => ({ url: '/config' }),
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
  useGetConfigQuery,
  useGetAvailableQuery,
  useGetMyDeliveriesQuery,
  useGetDeliveryQuery,
  useGetBalanceQuery,
  useActMutation,
} = serverApi;
