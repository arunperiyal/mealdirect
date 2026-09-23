# MealDirect mobile apps

An npm workspace with the Expo (SDK 57) apps and the code they share.

| Folder | What it is |
| --- | --- |
| `customer/` | Customer app: browse, order, pay, track |
| `restaurant/` | MealDirect Partner app for restaurant owners: orders, menus, settings |
| `admin/` | MealDirect Admin app for staff: restaurant and rider review, orders, analytics |
| `delivery/` | MealDirect Delivery app for riders: claim orders, pick up, deliver |
| `packages/shared/` | `@mealdirect/shared`: API client and token refresh, SecureStore session, shared types, money/date/status helpers, theme, common components |

## Setup

Install once, from this folder:

```bash
cd mobile
npm install
```

Then run an app from its own folder (see each app's README), e.g. `cd restaurant && npx expo start`.

Keep every app on the same Expo SDK and the same `react` / `react-native` versions. A second copy of React in the
workspace causes runtime errors. After adding a dependency, check with `npm ls react react-native`.

## Checks

```bash
npm test            # all workspaces
npm run typecheck   # all workspaces
```
