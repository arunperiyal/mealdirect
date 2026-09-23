# MealDirect Partner (restaurant app)

Expo (SDK 57) app for restaurant owners. It runs in Expo Go, so no custom build is needed.

## Run it

```bash
cd mobile && npm install    # once, installs every app in the workspace
cd restaurant
cp .env.example .env        # set EXPO_PUBLIC_API_URL, same values as the customer app
npx expo start
```

Sign up in the app and add your restaurant, then approve it in the MealDirect Admin app (`mobile/admin`).
The partner app checks for approval every 30 seconds and opens once it's through.

## What it does

| Area | Screens |
| --- | --- |
| Onboarding | Sign up as a partner → add restaurant → waiting for approval (shows the reviewer's note if rejected) |
| Today | New / in-progress / completed counts, today's sales, today's menu status, orders waiting to be accepted |
| Orders | Active / completed / cancelled, new orders first. Each order shows customer name and phone, address, delivery time, notes, items, payment, and one button for the next step: accept → start preparing → mark ready → send out for delivery → mark delivered. Cancelling asks for a reason, which the customer sees. |
| Menus | Past week and next two weeks. Create a menu for any of the next 7 days, add, edit and remove dishes, switch dishes off when sold out, set delivery times with a limit on orders, publish, stop taking orders. |
| Kitchen | Today or tomorrow: how much of each dish to cook, then one card per delivery time and one for pickup, each with its own dish totals, **Accept all new** and **Mark all ready** (skips "preparing"). Orders are folded under each card. |
| Settings | Restaurant details, delivery and pickup (fee and minimum order), order handling, payout details (UPI or bank account), switch between restaurants, sign out |

**Order handling** (off by default) is for messes and busy kitchens: accept pay-on-delivery orders automatically, and
mark accepted delivery orders ready 10–60 minutes before their delivery time.

The order screens check for changes every 10 seconds while open. Push notifications for new orders come with Phase 4.

Rules that come from the backend:
- An online order can't be accepted until the customer has paid.
- Menus can't be created until the restaurant is approved, and only draft menus can have their ordering window changed.
- A delivery time can't be deleted once orders are booked in it, and its limit can't drop below the orders already booked.
- Pickup orders are finished by the customer confirming they collected them.
- Pay on delivery: for pickup orders (once ready) and orders you deliver yourself (once delivered), record how
  the customer paid: **Received cash**, **Received UPI** or **Not paid**. **Today** lists payments still to
  record. Delivery partners record payment for the orders they deliver.
- Once a delivery partner accepts a delivery order, they handle pickup and delivery. The order shows their name
  and phone number. Until then, the restaurant can **Send out yourself**.

## Checks

```bash
npm test              # unit and screen tests
npm run typecheck
npm run lint
npx expo-doctor
```

`src/__contract__/liveApi.test.ts` runs the app's API layer against a real backend: sign up, onboarding and
approval, settings, menu setup, sold-out dishes, a delivery order from new to delivered, and cancelling:

```bash
LIVE_API_ADMIN_EMAIL=admin@example.com LIVE_API_ADMIN_PASSWORD=... \
  LIVE_API_URL=http://localhost:3000 npx jest src/__contract__
```

## Not built yet

- Operating hours (the backend stores them but nothing uses them yet; each menu has its own ordering window)
- Push notifications and a sound for new orders (Phase 4)
- Dish photos
- Order history beyond the latest 100 orders
