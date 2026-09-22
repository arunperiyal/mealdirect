# MealDirect Customer App

React Native (Expo SDK 57) app for customers: browse approved restaurants, order from
today's or tomorrow's menu, pay with Razorpay or cash, and track the order.

## Run it

```bash
cd mobile && npm install    # installs every app in the workspace
cd customer
cp .env.example .env        # then set EXPO_PUBLIC_API_URL
npx expo start              # press a (Android) or i (iOS), or scan with Expo Go
```

Shared code (API client, session, helpers, theme, common components) lives in `mobile/packages/shared`.

`EXPO_PUBLIC_API_URL` is the backend's base URL without `/api`:

| Where the app runs | Value |
| --- | --- |
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator | `http://localhost:3000` |
| Physical phone | `http://<your computer's LAN IP>:3000` |

The backend must be running (`cd backend && npm run dev`). For online payments it also needs
`RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (test keys start with `rzp_test_`). Without them,
"Pay online" shows "Online payments are not configured" and cash orders still work.

Everything used here ships in Expo Go, so no custom development build is needed.

## How it's built

| Concern | Choice |
| --- | --- |
| Routing | Expo Router, `src/app/`. Signed-in and signed-out stacks are split with `Stack.Protected`. |
| State | Redux Toolkit. `authSlice` and `cartSlice` are local state; server data goes through RTK Query (`store/serverApi.ts`). |
| HTTP | axios (`api/client.ts`) adds the bearer token, refreshes an expired token once (concurrent requests share the refresh) and signs out when the refresh token is rejected. |
| Tokens | `expo-secure-store` (Keychain / Keystore), never AsyncStorage. |
| Payments | Razorpay web Checkout in a WebView (`payments/`). The server verifies every payment signature, and UPI app links open outside the WebView. |

### Order and payment flow

1. Checkout creates the order (`POST /api/orders`) and clears the cart.
2. For **Pay online**, the order screen opens with `?pay=1` and starts payment automatically:
   `POST /api/payments/create-order` → Razorpay Checkout → `POST /api/payments/verify-payment`.
3. If the customer closes Checkout or the payment fails, the order stays pending with a
   **Pay** button. Razorpay's webhook also marks the order paid on the server, so a payment
   still counts if the app is killed before it verifies.
4. The order screen checks for status changes every 5 seconds until the order is delivered,
   picked up or cancelled.

An order belongs to one restaurant menu, so the cart holds items from one menu at a time.
Adding a dish from another menu asks before replacing the cart.

## Checks

```bash
npm test                 # unit and component tests (Jest + React Native Testing Library)
npm run typecheck        # tsc --noEmit
npm run lint             # expo lint
npx expo-doctor          # dependency and config health
```

`src/__contract__/liveApi.test.ts` runs the app's API layer against a real backend. It seeds a
restaurant and menu, then registers, browses, orders, cancels and starts a payment:

```bash
# needs a system admin: in backend/, ADMIN_PASSWORD=... npm run create-admin -- --email admin@example.com
LIVE_API_ADMIN_EMAIL=admin@example.com LIVE_API_ADMIN_PASSWORD=... \
  LIVE_API_URL=http://localhost:3000 npx jest src/__contract__
# add LIVE_API_SQLITE=1 if the backend runs on SQLite (restaurant search needs Postgres)
```

It prints a harmless "Jest environment has been torn down" warning after it passes.

## Not built yet

- Password reset (no backend endpoint yet)
- Cuisine and rating filters (restaurants have no cuisine field; ratings arrive in Phase 3)
- Saved addresses and saved payment methods (no backend support yet)
- Keeping the cart after the app is closed
- Push notifications (Phase 4 adds real-time updates)
