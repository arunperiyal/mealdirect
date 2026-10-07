import { createApi } from '@reduxjs/toolkit/query/react';
import {
  createAxiosBaseQuery,
  type AutoAcceptRule,
  type ChangeResult,
  type Collection,
  type Order,
  type PayoutDetails,
  type Restaurant,
  type RiderCash,
  type RiderProfile,
  type RiderRatings,
} from '@mealdirect/shared';
import { api } from '@/api';

export type DeliveryAction = 'claim' | 'release' | 'pick-up' | 'deliver';

export const serverApi = createApi({
  reducerPath: 'serverApi',
  baseQuery: createAxiosBaseQuery(api),
  tagTypes: ['Queue', 'Mine', 'Order', 'Balance', 'Profile', 'Ratings', 'Rule'],
  endpoints: (build) => ({
    // How customers rated your deliveries
    getRatings: build.query<RiderRatings, void>({
      query: () => ({ url: '/delivery/ratings' }),
      providesTags: ['Ratings'],
    }),
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
    // Auto-accept rules. Saving one takes matching orders already waiting, so the queue and
    // the rider's deliveries change too.
    getRules: build.query<AutoAcceptRule[], void>({
      query: () => ({ url: '/delivery/rules' }),
      providesTags: ['Rule'],
    }),
    addRule: build.mutation<AutoAcceptRule, { restaurantId: string; startTime: string; endTime: string }>({
      query: (data) => ({ url: '/delivery/rules', method: 'POST', data }),
      invalidatesTags: ['Rule', 'Queue', 'Mine'],
    }),
    updateRule: build.mutation<AutoAcceptRule, { id: string; startTime?: string; endTime?: string; enabled?: boolean }>({
      query: ({ id, ...data }) => ({ url: `/delivery/rules/${id}`, method: 'PUT', data }),
      invalidatesTags: ['Rule', 'Queue', 'Mine'],
    }),
    deleteRule: build.mutation<void, string>({
      query: (id) => ({ url: `/delivery/rules/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Rule'],
    }),
    // Restaurants that deliver, to set a rule for
    searchRestaurants: build.query<Restaurant[], string>({
      query: (search) => ({
        url: '/restaurants',
        params: { isApproved: true, limit: 20, ...(search ? { search } : {}) },
      }),
      transformResponse: (restaurants: Restaurant[]) => restaurants.filter((r) => r.deliveryEnabled),
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
  useGetRulesQuery,
  useAddRuleMutation,
  useUpdateRuleMutation,
  useDeleteRuleMutation,
  useSearchRestaurantsQuery,
  useGetRatingsQuery,
  useGetProfileQuery,
  useUpdatePersonalMutation,
  useUpdatePayoutMutation,
  useGetAvailableQuery,
  useGetMyDeliveriesQuery,
  useGetDeliveryQuery,
  useGetBalanceQuery,
  useActMutation,
} = serverApi;
