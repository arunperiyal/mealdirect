# MealDirect Admin (system admin app)

Expo (SDK 57) app for MealDirect staff: review restaurants, watch orders, see how the platform is doing.
It runs in Expo Go.

## Run it

```bash
cd mobile && npm install    # once, installs every app in the workspace
cd admin
npx expo start --port 8083  # a different port if the other apps are running
```

Admins can't sign up in the app. Create an account on the server first:

```bash
cd backend
read -s ADMIN_PASSWORD && export ADMIN_PASSWORD   # at least 12 characters
npm run create-admin -- --email you@example.com --first-name Asha --last-name Rao
```

## What it does

| Tab | What's there |
| --- | --- |
| Overview | Last 7 / 30 / 90 days: sales, orders, average order, repeat customers; orders and sales per day (per week for 90 days); top 5 restaurants by sales; platform counts; a table view of the chart data. Banners link to restaurants waiting for review and to detail changes waiting for review. |
| Restaurants | Waiting / live / rejected, with counts and search. Waiting shows the oldest first. Each restaurant shows its details, the owner's contact details, payout details (UPI ID, account holder, masked account number, IFSC) and, once live, sales for the last 30 days. Approve (optional note; needs the payout details) or reject (a note for the owner is required; they see it in the partner app). Rejected restaurants can be approved later. |
| Riders | Waiting / approved / suspended delivery partners with phone, sign-up date, completed deliveries and cash held. Approve new riders; suspend one to stop them taking or updating deliveries at once. Tap a rider for their cash: record cash they hand over (anything less stays owed), write off an amount with a reason, and see the settlement history. Riders holding cash from before today can't accept deliveries. |
| Changes to review | Changes to payout or personal details from approved restaurants and riders, oldest first, each showing the current and new values (account numbers masked). **Approve** puts the new details in use; **Reject** needs a note, which the restaurant or rider sees. Their current details stay in use until then. |
| Orders (payments) | The **Not paid** filter lists every order a rider or restaurant reported as unpaid. Resolve one as **Mark paid** (cash or UPI) or **Write off**, with a required note. Either way the customer can order again. |
| Orders | The latest 100 orders across all restaurants: active / completed / cancelled. Each order shows the restaurant, customer, delivery partner, items, payment and timeline, and can be cancelled with a reason. |
| Account | Who's signed in, sign out, and **Users**: find a customer, partner or rider by name, email or phone, and change the email they sign in with (their password stays, and they stay signed in) |

Charts follow the project's dataviz rules: a single series per chart (no dual axes), one validated blue for data
(the brand red would read as "bad" on a sales chart), tap a column to read its value, and every number is also in
the table view.

Days in the charts follow the phone's timezone. The backend groups orders in memory, which is fine at current
volumes. Move it to SQL `GROUP BY` when order counts grow.

## Not built yet

- Suspending a live restaurant (the backend has no endpoint for it)
- Comparing with the previous period
- Refunds (cancelling a paid online order still needs a manual refund in Razorpay)
- Other user management (suspending customers, editing names or phones); only the email can be changed

## Checks

```bash
npm test && npm run typecheck && npm run lint && npx expo-doctor
```

`src/__contract__/liveApi.test.ts` runs the app's API layer against a real backend. It covers review with
reject then approve, analytics, and orders:

```bash
LIVE_API_ADMIN_EMAIL=admin@example.com LIVE_API_ADMIN_PASSWORD=... \
  LIVE_API_URL=http://localhost:3000 npx jest src/__contract__
```
