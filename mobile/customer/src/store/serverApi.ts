import { createApi } from '@reduxjs/toolkit/query/react';
import {
  createAxiosBaseQuery,
  type AppConfig,
  type CreateOrderInput,
  type DeliverySlot,
  type Menu,
  type Order,
  type PaymentOrder,
  type RazorpaySuccess,
  type Restaurant,
} from '@mealdirect/shared';
import { api } from '@/api';

export const serverApi = createApi({
  reducerPath: 'serverApi',
  baseQuery: createAxiosBaseQuery(api),
  tagTypes: ['Order'],
  endpoints: (build) => ({
    // Which payment options to offer (online payment can be switched off on the server)
    getConfig: build.query<AppConfig, void>({
      query: () => ({ url: '/config' }),
    }),

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
  useGetConfigQuery,
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
