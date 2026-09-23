import { createApi } from '@reduxjs/toolkit/query/react';
import { createAxiosBaseQuery, type Order } from '@mealdirect/shared';
import { api } from '@/api';

export type DeliveryAction = 'claim' | 'release' | 'pick-up' | 'deliver';

export const serverApi = createApi({
  reducerPath: 'serverApi',
  baseQuery: createAxiosBaseQuery(api),
  tagTypes: ['Queue', 'Mine', 'Order'],
  endpoints: (build) => ({
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
    act: build.mutation<Order, { id: string; action: DeliveryAction }>({
      query: ({ id, action }) => ({ url: `/delivery/orders/${id}/${action}`, method: 'POST' }),
      // Claiming or releasing changes the queue; every action changes my list and the order
      invalidatesTags: (_o, _e, { id }) => ['Queue', 'Mine', { type: 'Order', id }],
    }),
  }),
});

export const { useGetAvailableQuery, useGetMyDeliveriesQuery, useGetDeliveryQuery, useActMutation } = serverApi;
