# MealDirect mobile apps

An npm workspace with the Expo (SDK 57) apps and the code they share.

| Folder | What it is |
| --- | --- |
| `customer/` | Customer app: browse, order, pay, track |
| `restaurant/` | MealDirect Partner app for restaurant owners: orders, menus, settings |
| `admin/` | MealDirect Admin app for staff: restaurant and rider review, orders, analytics |
| `delivery/` | MealDirect Delivery app for riders: claim orders, pick up, deliver, record payment (cash, UPI QR to the restaurant, not paid), personal and payout details |
| `packages/shared/` | `@mealdirect/shared`: API client and token refresh, SecureStore session, shared types, money/date/status helpers, theme, common components |

## Setup

Install once, from this folder:

```bash
cd mobile
npm install
```

Then run an app from its own folder (see each app's README), e.g. `cd restaurant && npx expo start`.

### Running everything at once (tmux)

`dev-session.sh` in the repo root opens a tmux session called `MEALDIRECT`: the backend (`npm run dev`) and one Expo
dev server per app, each on a fixed port. It starts the `mess_postgres` database container if it's stopped, and
running it again attaches to the session that's already open.

```bash
./dev-session.sh                       # backend + all four apps
./dev-session.sh customer restaurant   # backend + only these apps
```

| App | Metro port |
| --- | --- |
| customer | 8081 |
| restaurant | 8082 |
| admin | 8083 |
| delivery | 8084 |

Windows: `servers` (backend on the left, apps stacked on the right; prefix + `z` enlarges a pane to scan its QR
code), `main` (`nvim`), and `zsh` (shells in `backend/`, `mobile/` and the repo root).

Keep every app on the same Expo SDK and the same `react` / `react-native` versions. A second copy of React in the
workspace causes runtime errors. After adding a dependency, check with `npm ls react react-native`.

## Checks

```bash
npm test            # all workspaces
npm run typecheck   # all workspaces
```

## Building the apps (EAS)

Each app has an `eas.json` with two profiles:

| Profile | Output | API address |
| --- | --- | --- |
| `preview` | Installable Android APK for testers | Expo environment variable `EXPO_PUBLIC_API_URL` (environment `preview`). May be plain HTTP, e.g. a dev server on your LAN; only this profile allows cleartext traffic. |
| `production` | Android App Bundle for Google Play, with an auto-incremented version code | `EXPO_PUBLIC_API_URL` (environment `production`), which must be `https://`. The build fails otherwise. |

Local `.env` files are not uploaded to EAS, so set the address per app once:

```bash
npx eas-cli login                  # once, with your Expo account
cd mobile/customer                 # repeat in restaurant/, admin/ and delivery/
npx eas-cli init                   # links the app to an Expo project (adds its projectId to app.json)
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL \
  --value http://192.168.0.161:3000 --visibility plaintext
npx eas-cli build --platform android --profile preview
```

When the build finishes, EAS prints a link and QR code to install the APK. A preview build that points at a
LAN address only works on the same Wi-Fi as the backend. Once the API is deployed (see `backend/DEPLOY.md`),
set the preview and production addresses to its `https://` URL.

## Payments

Online payment (Razorpay) is on hold: the backend's `/api/config` reports `onlinePayments: false`, so checkout
offers only pay on delivery or pay at pickup. Setting `ONLINE_PAYMENTS_ENABLED=true` (with Razorpay keys) on the
server brings it back without a new app release.
