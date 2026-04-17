# Mess Delivery App - Implementation Plan

## Overview
Transform the UberEats clone (Grub) into a **local mess/restaurant delivery app** with support for:
- **Daily menus**: Restaurants post multiple menus per day
- **Flexible delivery**: Fixed restaurant times + customer-selected time slots
- **Three user roles**: Customer, Restaurant (Admin), System Admin
- **Pickup & Delivery**: Both options supported
- **Reviews & Ratings**: Customers rate restaurants and dishes
- **Dual payment**: Cash-on-delivery + online payments

Current app is customer-focused only with mock backend. This plan includes frontend UI changes, data model extensions, and backend infrastructure design.

---

## Current State Analysis
**Technology Stack:**
- Frontend: Codename One (Java cross-platform framework) - Android, iOS, Desktop, Web
- Architecture: MVC (CodeRAD library) with clear separation
- Current scope: ~80 Java files organized into interfaces, models, controllers, views

**Current Features:**
- Authentication (sign in/register)
- Restaurant browsing with filters
- Shopping cart & orders
- Payment (credit cards only)
- Order tracking
- User profiles
- Dark/light mode

**Current Limitations:**
- No restaurant admin interface
- No system admin interface
- No backend integration (mock data only)
- No daily menu concept
- No delivery time management
- No ratings/reviews
- No cash-on-delivery option
- Single payment method

---

## Data Model Changes Required

### New/Extended Entities

**Restaurant (extend existing):**
- `bankDetails` - for payment settlements
- `operatingHours` - daily business hours
- `maxOrdersPerSlot` - capacity management
- `isApproved` - admin verification status
- `ownerId` - link to restaurant admin user
- `deliveryEnabled` - boolean for delivery service
- `pickupEnabled` - boolean for pickup option
- `defaultDeliveryFee` - base delivery charge

**Menu (new):**
- `restaurantId` - FK to restaurant
- `date` - menu date
- `items` - list of dishes
- `isActive` - publish/draft status
- `orderingStartTime` - when ordering opens
- `orderingEndTime` - when ordering closes
- `deliverySlots` - predefined delivery time options

**DeliverySlot (new):**
- `menuId` - FK to menu
- `time` - delivery time
- `maxOrders` - capacity
- `currentOrders` - count
- `isFull` - boolean

**Order (extend existing):**
- `deliveryType` - "delivery" or "pickup"
- `selectedDeliverySlot` - link to DeliverySlot (if applicable)
- `paymentMethod` - "card" or "cod"
- `menuId` - link to specific daily menu
- `deliveryAddress` - stored address (for delivery orders)
- `pickupTime` - estimated pickup (for pickup orders)
- `status` - "pending", "confirmed", "preparing", "ready", "delivered/picked-up", "cancelled"

**Review (new):**
- `restaurantId` - FK to restaurant
- `dishId` - FK to dish (optional, for item reviews)
- `customerId` - FK to customer
- `rating` - 1-5 stars
- `comment` - review text
- `createdAt` - timestamp

**User Role (new/extend Account):**
- `roleType` - "customer", "restaurant_admin", "system_admin"
- `restaurantId` - (for restaurant_admin only)
- `verificationStatus` - "pending", "verified", "rejected" (for restaurant_admin)

---

## Feature Development Phases

### Phase 1: Data Model & Backend Foundation
- Extend database schema for new entities
- Create backend APIs (RESTful with JWT auth)
- Implement role-based access control (RBAC)
- User authentication & authorization middleware
- Payment gateway integration (Stripe, Razorpay, or similar)

### Phase 2: Restaurant Admin Interface
- Restaurant profile management (bank details, hours, delivery settings)
- Daily menu creation/editing
- Delivery slot management (time, capacity)
- Order management dashboard (view, confirm, mark ready)
- Payment settlement tracking
- Basic analytics (orders, revenue by day)

### Phase 3: System Admin Interface
- Restaurant approval/verification workflow
- User management (view, block, support)
- Payment disputes & refund handling
- System-wide analytics
- Commission/fee management

### Phase 4: Customer App Enhancements
- Multi-menu selection per restaurant
- Delivery vs pickup toggle
- Delivery slot selection
- Delivery address mapping
- Cash-on-delivery option
- Order status updates
- Rating & review submission
- Review viewing

### Phase 5: Delivery Logistics (Optional)
- Delivery personnel role (if self-delivery is used)
- Real-time location tracking
- Delivery acceptance/rejection

### Phase 6: Testing & Polish
- Integration testing
- User acceptance testing (UAT)
- Performance optimization
- Security audit
- Production deployment preparation

---

## Backend Infrastructure Design

### Technology Stack (Recommended):
- **API Server**: Node.js/Express, Java Spring Boot, or Python/Flask
- **Database**: PostgreSQL (relational + good for complex queries)
- **Cache**: Redis (order slots, session management)
- **Payment**: Stripe/Razorpay API integration
- **Auth**: JWT tokens with refresh token rotation
- **Hosting**: AWS/GCP/Azure or local VPS
- **API Documentation**: Swagger/OpenAPI

### Core APIs to Build:
1. **Authentication**
   - POST `/auth/register` - user registration
   - POST `/auth/login` - user login
   - POST `/auth/refresh-token` - token refresh
   - POST `/auth/logout` - logout

2. **Restaurants**
   - GET `/restaurants` - list with filters
   - GET `/restaurants/{id}` - details
   - POST `/restaurants` - create (admin)
   - PUT `/restaurants/{id}` - update (restaurant admin)
   - GET `/restaurants/{id}/menus` - daily menus

3. **Menus & Delivery Slots**
   - GET `/menus/{date}` - menus for date
   - POST `/menus` - create (restaurant admin)
   - GET `/menus/{id}/slots` - delivery slots
   - POST `/menus/{id}/slots` - create slots

4. **Orders**
   - POST `/orders` - create order
   - GET `/orders/{id}` - order details
   - PUT `/orders/{id}/status` - update status (admin)
   - GET `/my-orders` - customer's orders

5. **Reviews**
   - POST `/reviews` - submit review
   - GET `/restaurants/{id}/reviews` - restaurant reviews
   - GET `/dishes/{id}/reviews` - dish reviews

6. **Admin**
   - GET `/admin/restaurants` - manage restaurants
   - PUT `/admin/restaurants/{id}/approve` - verify restaurant
   - GET `/admin/analytics` - reports & analytics

7. **Payments**
   - POST `/payments/initiate` - start payment
   - POST `/payments/callback` - payment webhook
   - GET `/payments/{id}/status` - payment status

---

## UI/UX Changes Required

### Customer Mode (Enhancements):
- Multi-menu browsing per restaurant
- Delivery vs pickup toggle
- Delivery time slot selector
- Delivery address input/selection
- Payment method selector (card/COD)
- Order timeline with real status updates
- Restaurant & item reviews display
- Rating/review submission flow

### Restaurant Admin Mode (New):
- Dashboard: Orders, revenue, upcoming slots
- Menu builder: Daily menus with item selection
- Order management: Accept/reject, mark ready
- Settings: Operating hours, delivery settings, bank details
- Analytics: Charts, revenue reports
- Profile: Restaurant info, verification status

### System Admin Mode (New):
- Dashboard: System metrics, pending approvals
- Restaurant management: Approve, reject, suspend
- User management: View, block, support tickets
- Payment disputes: Review, resolve
- Analytics: Platform-wide reports, commission tracking

### Navigation Changes:
- Add role-based navigation (currently customer-only)
- Add mode selector at login or settings
- Add tabs for different sections per mode

---

## Implementation Priorities & Dependencies

### Phase 1 Dependencies: None (foundational)
1. `backend-setup` - Server, DB, basic structure
2. `data-model-extension` - Schema, migrations
3. `user-auth-system` - JWT, RBAC middleware

### Phase 2 Dependencies: Requires Phase 1 complete
4. `restaurant-api` - Restaurant endpoints
5. `menu-api` - Menu and slot management
6. `restaurant-ui` - Admin interface screens
7. `order-management-api` - Order status, updates

### Phase 3 Dependencies: Requires Phase 1 + 2 partially
8. `admin-api` - Approval, user management
9. `admin-ui` - System admin interface
10. `analytics-system` - Reports, aggregations

### Phase 4 Dependencies: Requires Phase 1 + 2
11. `customer-ui-enhancements` - New screens/flows
12. `review-system` - API + UI
13. `payment-integration` - Stripe/Razorpay setup
14. `order-tracking` - Real-time updates

### Phase 5 (Optional) Dependencies: Requires Phase 2
15. `delivery-role` - Delivery personnel interface
16. `location-tracking` - Maps integration

---

## Migration Path from Current App

1. **Preserve Existing Code**: Keep working customer features
2. **Extend Models**: Add new fields to existing entities
3. **Add Role Switch**: Modify login to support role selection
4. **Build Admin UIs**: New screens in parallel (don't break existing)
5. **Backend Integration**: Add API calls gradually
6. **Testing**: Ensure backward compatibility during refactor

---

## Estimated Scope (Relative Effort)

| Feature | Frontend | Backend | Effort |
|---------|----------|---------|--------|
| Data model extension | - | 5h | 5h |
| User authentication with roles | 10h | 15h | 25h |
| Restaurant API | - | 20h | 20h |
| Menu & slots API | - | 15h | 15h |
| Order management API | 10h | 20h | 30h |
| Restaurant admin UI | 30h | - | 30h |
| System admin UI | 25h | - | 25h |
| Customer UI enhancements | 20h | - | 20h |
| Review system | 10h | 10h | 20h |
| Payment integration | 15h | 15h | 30h |
| Delivery tracking | 20h | 15h | 35h |
| Testing & polish | 30h | 20h | 50h |
| **Total** | **170h** | **130h** | **300h** |

---

## Key Considerations

- **Database Transactions**: Order + payment + slot update must be atomic
- **Scalability**: Slot management under high load (cache delivery slots)
- **Real-time Updates**: WebSocket for order status or polling strategy
- **Security**: Verify user owns restaurant before allowing menu/order changes
- **Time Zones**: Handle mess in different time zones properly
- **Inventory**: Track slot availability to prevent overbooking
- **Refunds**: COD refund handling vs online refunds
- **Regulatory**: Verify payment gateway compliance for target country

---

## Next Steps

1. **Confirm Plan**: User reviews and approves (or suggests changes)
2. **Choose Backend Stack**: Node.js/Java/Python decision
3. **Setup Infrastructure**: Database, server boilerplate
4. **Begin Phase 1**: Start with data model and API foundation
5. **Iterative Development**: Complete phases sequentially with testing
