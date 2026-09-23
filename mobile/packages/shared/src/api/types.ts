// Shapes returned by the MealDirect backend (backend/src/models)

export type Role = 'customer' | 'restaurant_admin' | 'system_admin' | 'delivery_partner';

export type RiderStatus = 'pending' | 'approved' | 'suspended';

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: Role;
  riderStatus?: RiderStatus; // delivery partners only
}

export interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  isApproved: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  defaultDeliveryFee: number | string | null;
  minOrderForDelivery: number | string | null;
  avgRating: number | string | null;
  totalReviews: number | null;
  logoUrl: string | null;
  bannerUrl: string | null;
}

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

// What a restaurant's owner sees (GET /restaurants/my-restaurants)
export interface OwnedRestaurant extends Restaurant {
  ownerId: string;
  email: string;
  zipCode: string | null;
  verificationStatus: VerificationStatus;
  verificationNotes: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIFSC: string | null;
  upiId: string | null;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  imageUrl?: string | null;
  available: boolean;
}

export type MenuStatus = 'draft' | 'published' | 'closed' | 'archived';

export interface Menu {
  id: string;
  restaurantId: string;
  date: string; // YYYY-MM-DD
  orderingStartTime: string | null;
  orderingEndTime: string | null;
  items: MenuItem[];
  status: MenuStatus;
}

export interface DeliverySlot {
  id: string;
  menuId: string;
  startTime: string; // HH:mm:ss
  endTime: string;
  maxOrders: number;
  currentOrders: number;
}

export type DeliveryType = 'delivery' | 'pickup';
export type PaymentMethod = 'online' | 'cod';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'picked_up'
  | 'cancelled';

export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Order {
  id: string;
  customerId: string;
  restaurantId: string;
  menuId: string;
  items: OrderItem[];
  deliveryType: DeliveryType;
  deliverySlotId: string | null;
  deliveryAddress: string | null;
  // Legacy orders may still carry 'credit_card'
  paymentMethod: PaymentMethod | 'credit_card';
  paymentStatus: 'pending' | 'completed' | 'failed';
  subtotal: number | string;
  tax: number | string;
  deliveryFee: number | string;
  discount: number | string;
  total: number | string;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; timestamp: string; changedBy: string }[];
  customerNotes: string | null;
  cancellationReason: string | null;
  createdAt: string;
  confirmedAt?: string | null;
  readyAt?: string | null;
  deliveredAt?: string | null;
  // Included on restaurant and single-order reads
  customer?: { id: string; firstName: string | null; lastName: string | null; phone: string | null };
  deliverySlot?: { id: string; startTime: string; endTime: string } | null;
  // Included on the system admin order list and rider views (with address and phone)
  restaurant?: { id: string; name: string; address?: string | null; city?: string | null; phone?: string | null };
  // The delivery partner who claimed the order
  rider?: { id: string; firstName: string | null; lastName: string | null; phone: string | null } | null;
  riderId?: string | null;
  claimedAt?: string | null;
}

export interface CreateOrderInput {
  restaurantId: string;
  menuId: string;
  items: { menuItemId: string; quantity: number }[];
  deliveryType: DeliveryType;
  deliverySlotId?: string;
  deliveryAddress?: string;
  paymentMethod: PaymentMethod;
  customerNotes?: string;
}

export interface PaymentOrder {
  paymentId: string;
  orderId: string;
  razorpayOrderId: string;
  amount: number; // paise
  currency: string;
  keyId: string;
}

export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// System admin views (GET /api/admin/*)
export interface AdminRestaurant extends OwnedRestaurant {
  approvedAt: string | null;
  createdAt: string;
  owner: { id: string; firstName: string | null; lastName: string | null; email: string; phone: string | null };
}

export interface SalesSummary {
  orders: number;
  cancelled: number;
  revenue: number; // orders that weren't cancelled
  averageOrderValue: number;
}

export interface AdminRestaurantDetail {
  restaurant: AdminRestaurant;
  stats: SalesSummary & { last30Days: SalesSummary; lastOrderAt: string | null };
}

export interface Analytics {
  range: { from: string; to: string; days: number };
  totals: SalesSummary & { customers: number; repeatCustomers: number };
  byDay: { date: string; orders: number; revenue: number }[];
  topRestaurants: { id: string; name: string; orders: number; revenue: number }[];
  restaurants: Record<VerificationStatus, number>;
  users: { customers: number; partners: number; admins: number };
}

export interface AdminRider {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  riderStatus: RiderStatus;
  createdAt: string;
  deliveries: number; // completed
}
