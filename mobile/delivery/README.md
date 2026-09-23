# MealDirect Delivery (rider app)

Expo (SDK 57) app for delivery partners. It runs in Expo Go.

## Run it

```bash
cd mobile && npm install    # once, installs every app in the workspace
cd delivery
cp .env.example .env        # set EXPO_PUBLIC_API_URL, same values as the other apps
npx expo start --port 8084  # a different port if the other apps are running
```

Sign up in the app (a mobile number is required), then approve the rider in the MealDirect Admin app
(**Riders → Waiting → Approve**). The app checks for approval every 30 seconds.

If you pulled this onto an existing Postgres database, run `npm run upgrade-db` in `backend/` first.

## How delivery works

1. A restaurant accepts a delivery order. It appears under **Available** for every approved rider, with orders
   that are ready listed first.
2. The first rider to tap **Accept delivery** gets it. The backend checks this in a single update, so two riders
   can't both win. A rider can hold up to 3 active deliveries.
3. The rider heads to the restaurant. While the kitchen prepares the order, the rider can give it back to the
   queue.
4. When the restaurant marks it ready, the rider taps **Picked up from restaurant**, then **Delivered**.

## Payment at the door

For pay-on-delivery orders, **Delivered** asks how the customer paid:

- **Cash received**: the rider now holds that cash for MealDirect.
- **Customer pays by UPI**: shows a QR code for the restaurant's UPI ID with the exact amount and the order
  number. The customer scans it with any UPI app, and the rider taps **Customer has paid** once their screen
  shows success. The money goes straight to the restaurant, so the rider has nothing to settle.
- **Not paid**: with an optional note. The customer can't order again until a MealDirect admin resolves it.

Riders hand collected cash to MealDirect. **My deliveries** shows the cash to settle. A rider can't accept new
deliveries while holding cash from before today (India time); an admin records the settlement in the
MealDirect Admin app.

The UPI ID is the one in the restaurant's payout details. A restaurant can't be approved without one; for an
older restaurant that has none, the UPI option is disabled and the rider collects cash.

## Your details

**Account** has **Personal details** (name and phone) and **Payout details** (UPI ID and bank account, where
MealDirect pays tips and earnings). Riders waiting for approval can fill these in and they save at once. After
approval, a change waits for a MealDirect admin: the app shows it as waiting, keeps the current details in use,
and shows the admin's note if it's turned down. Email can't be changed.

Before accepting, riders see the restaurant, the drop address, the time and the amount to collect, but only the
customer's first name. The customer's phone number shows once they accept. Customers, restaurants and admins see
the rider's name and phone number on the order.

Restaurants can still deliver an order themselves while no rider has claimed it. The MealDirect Partner app
shows **Send out yourself** in that case.

**Map** opens the phone's maps app with the address text. There is no location tracking. Live location and map
picking come in a later phase.

## Checks

```bash
npm test && npm run typecheck && npm run lint && npx expo-doctor
```

The live contract test covers sign-up and approval, the queue, two riders racing for one order, pickup,
delivery with cash, and release:

```bash
LIVE_API_ADMIN_EMAIL=admin@example.com LIVE_API_ADMIN_PASSWORD=... \
  LIVE_API_URL=http://localhost:3000 npx jest src/__contract__
```

## Not built yet

- Live location and customer tracking (later phase)
- Rider earnings and paying out tips and salary (payout details are collected, payments aren't built)
- Paying the rider's UPI when the restaurant's doesn't work (planned)
- Push notifications for new orders (the queue refreshes every 15 seconds)
