import { createApi } from '@reduxjs/toolkit/query/react';
import {
  createAxiosBaseQuery,
  type DeliverySlot,
  type Menu,
  type MenuItem,
  type Order,
  type Collection,
  type KitchenDay,
  type OwnedRestaurant,
} from '@mealdirect/shared';
import { api } from '@/api';

export type OrderAction =
  | 'confirm'
  | 'mark-preparing'
  | 'mark-ready'
  | 'mark-out-for-delivery'
  | 'mark-delivered';

export interface RestaurantInput {
  name: string;
  email: string;
  phone?: string;
  description?: string;
  address?: string;
  city?: string;
  zipCode?: string;
}

export interface DeliverySettings {
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  defaultDeliveryFee: number;
  minOrderForDelivery: number;
}

export interface BankDetails {
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIFSC?: string;
  upiId?: string;
}

export interface OrderSettings {
  autoAcceptOrders: boolean;
  autoReadyMinutes: number | null; // before a delivery slot starts; null = off
}

export interface BulkInput {
  menuId: string;
  group: string; // delivery slot id, 'unscheduled' or 'pickup'
  action: 'accept' | 'ready';
}

export type ItemInput = Pick<MenuItem, 'name' | 'price'> & Partial<Pick<MenuItem, 'description' | 'available'>>;

export interface SlotInput {
  startTime: string; // HH:mm
  endTime: string;
  maxOrders: number;
}

export const serverApi = createApi({
  reducerPath: 'serverApi',
  baseQuery: createAxiosBaseQuery(api),
  tagTypes: ['Restaurant', 'Order', 'Menu', 'Slot'],
  endpoints: (build) => ({
    // Restaurants
    getMyRestaurants: build.query<OwnedRestaurant[], void>({
      query: () => ({ url: '/restaurants/my-restaurants', params: { limit: 100 } }),
      providesTags: ['Restaurant'],
    }),
    createRestaurant: build.mutation<OwnedRestaurant, RestaurantInput>({
      query: (data) => ({ url: '/restaurants', method: 'POST', data }),
      invalidatesTags: ['Restaurant'],
    }),
    updateRestaurant: build.mutation<OwnedRestaurant, { id: string } & Partial<RestaurantInput>>({
      // Email isn't editable after creation
      query: ({ id, email: _email, ...data }) => ({ url: `/restaurants/${id}`, method: 'PUT', data }),
      invalidatesTags: ['Restaurant'],
    }),
    updateDeliverySettings: build.mutation<OwnedRestaurant, { id: string } & DeliverySettings>({
      query: ({ id, ...data }) => ({ url: `/restaurants/${id}/delivery-settings`, method: 'PUT', data }),
      invalidatesTags: ['Restaurant'],
    }),
    updateBankDetails: build.mutation<OwnedRestaurant, { id: string } & BankDetails>({
      query: ({ id, ...data }) => ({ url: `/restaurants/${id}/bank-details`, method: 'PUT', data }),
      invalidatesTags: ['Restaurant'],
    }),
    updateOrderSettings: build.mutation<OwnedRestaurant, { id: string } & OrderSettings>({
      query: ({ id, ...data }) => ({ url: `/restaurants/${id}/order-settings`, method: 'PUT', data }),
      invalidatesTags: ['Restaurant'],
    }),

    // Orders
    getRestaurantOrders: build.query<Order[], { restaurantId: string }>({
      query: ({ restaurantId }) => ({
        url: '/orders/restaurant-orders',
        params: { restaurantId, limit: 100 },
      }),
      providesTags: (orders = []) => [
        { type: 'Order', id: 'LIST' },
        ...orders.map((o) => ({ type: 'Order' as const, id: o.id })),
      ],
    }),
    // One day's cooking: dish totals and orders grouped by delivery time
    getKitchen: build.query<KitchenDay, { restaurantId: string; date: string }>({
      query: (params) => ({ url: '/orders/kitchen', params }),
      providesTags: [{ type: 'Order', id: 'LIST' }],
    }),
    bulkAdvance: build.mutation<{ updated: number; skipped: number }, BulkInput>({
      query: (data) => ({ url: '/orders/bulk', method: 'POST', data }),
      // Every order in the group changed, so refetch all of them
      invalidatesTags: ['Order'],
    }),
    getOrder: build.query<Order, string>({
      query: (id) => ({ url: `/orders/${id}` }),
      providesTags: (_o, _e, id) => [{ type: 'Order', id }],
    }),
    advanceOrder: build.mutation<Order, { id: string; action: OrderAction }>({
      query: ({ id, action }) => ({ url: `/orders/${id}/${action}`, method: 'POST' }),
      invalidatesTags: (_o, _e, { id }) => [
        { type: 'Order', id },
        { type: 'Order', id: 'LIST' },
      ],
    }),
    recordPayment: build.mutation<Order, { id: string; collection: Collection; note?: string }>({
      query: ({ id, collection, note }) => ({
        url: `/orders/${id}/record-payment`,
        method: 'POST',
        data: { collection, ...(note ? { note } : {}) },
      }),
      invalidatesTags: (_o, _e, { id }) => [
        { type: 'Order', id },
        { type: 'Order', id: 'LIST' },
      ],
    }),
    cancelOrder: build.mutation<Order, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/orders/${id}/cancel`, method: 'POST', data: { reason } }),
      invalidatesTags: (_o, _e, { id }) => [
        { type: 'Order', id },
        { type: 'Order', id: 'LIST' },
        // Cancelling frees a delivery slot
        'Slot',
      ],
    }),

    // Menus
    getMenus: build.query<Menu[], { restaurantId: string; from: string; to: string }>({
      query: (params) => ({ url: '/menus', params: { ...params, limit: 100 } }),
      providesTags: (menus = []) => [
        { type: 'Menu', id: 'LIST' },
        ...menus.map((m) => ({ type: 'Menu' as const, id: m.id })),
      ],
    }),
    getMenu: build.query<Menu, string>({
      query: (id) => ({ url: `/menus/${id}` }),
      providesTags: (_m, _e, id) => [{ type: 'Menu', id }],
    }),
    createMenu: build.mutation<
      Menu,
      { restaurantId: string; date: string; orderingStartTime?: string; orderingEndTime?: string }
    >({
      query: (data) => ({ url: '/menus', method: 'POST', data }),
      invalidatesTags: [{ type: 'Menu', id: 'LIST' }],
    }),
    updateMenu: build.mutation<Menu, { id: string; orderingStartTime?: string; orderingEndTime?: string }>({
      query: ({ id, ...data }) => ({ url: `/menus/${id}`, method: 'PUT', data }),
      invalidatesTags: (_m, _e, { id }) => [{ type: 'Menu', id }],
    }),
    setMenuStatus: build.mutation<Menu, { id: string; action: 'publish' | 'close' }>({
      query: ({ id, action }) => ({ url: `/menus/${id}/${action}`, method: 'POST' }),
      invalidatesTags: (_m, _e, { id }) => [
        { type: 'Menu', id },
        { type: 'Menu', id: 'LIST' },
      ],
    }),
    addMenuItem: build.mutation<Menu, { menuId: string; item: ItemInput }>({
      query: ({ menuId, item }) => ({ url: `/menus/${menuId}/items`, method: 'POST', data: { items: [item] } }),
      invalidatesTags: (_m, _e, { menuId }) => [
        { type: 'Menu', id: menuId },
        { type: 'Menu', id: 'LIST' },
      ],
    }),
    updateMenuItem: build.mutation<Menu, { menuId: string; itemId: string; changes: Partial<ItemInput> }>({
      query: ({ menuId, itemId, changes }) => ({
        url: `/menus/${menuId}/items/${itemId}`,
        method: 'PUT',
        data: changes,
      }),
      invalidatesTags: (_m, _e, { menuId }) => [{ type: 'Menu', id: menuId }],
    }),
    removeMenuItem: build.mutation<Menu, { menuId: string; itemId: string }>({
      query: ({ menuId, itemId }) => ({ url: `/menus/${menuId}/items/${itemId}`, method: 'DELETE' }),
      invalidatesTags: (_m, _e, { menuId }) => [
        { type: 'Menu', id: menuId },
        { type: 'Menu', id: 'LIST' },
      ],
    }),

    // Delivery slots
    getMenuSlots: build.query<DeliverySlot[], string>({
      query: (menuId) => ({ url: `/menus/${menuId}/slots` }),
      providesTags: ['Slot'],
    }),
    addSlot: build.mutation<DeliverySlot, { menuId: string } & SlotInput>({
      query: ({ menuId, ...data }) => ({ url: `/menus/${menuId}/slots`, method: 'POST', data }),
      invalidatesTags: ['Slot'],
    }),
    updateSlot: build.mutation<DeliverySlot, { id: string } & Partial<SlotInput>>({
      query: ({ id, ...data }) => ({ url: `/menus/slots/${id}`, method: 'PUT', data }),
      invalidatesTags: ['Slot'],
    }),
    deleteSlot: build.mutation<unknown, string>({
      query: (id) => ({ url: `/menus/slots/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Slot'],
    }),
  }),
});

export const {
  useGetMyRestaurantsQuery,
  useCreateRestaurantMutation,
  useUpdateRestaurantMutation,
  useUpdateDeliverySettingsMutation,
  useUpdateBankDetailsMutation,
  useUpdateOrderSettingsMutation,
  useGetRestaurantOrdersQuery,
  useGetKitchenQuery,
  useBulkAdvanceMutation,
  useGetOrderQuery,
  useAdvanceOrderMutation,
  useRecordPaymentMutation,
  useCancelOrderMutation,
  useGetMenusQuery,
  useGetMenuQuery,
  useCreateMenuMutation,
  useUpdateMenuMutation,
  useSetMenuStatusMutation,
  useAddMenuItemMutation,
  useUpdateMenuItemMutation,
  useRemoveMenuItemMutation,
  useGetMenuSlotsQuery,
  useAddSlotMutation,
  useUpdateSlotMutation,
  useDeleteSlotMutation,
} = serverApi;
