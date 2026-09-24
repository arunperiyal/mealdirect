# MealDirect

Food ordering and delivery for local restaurants and messes (canteens that cook one menu in bulk each day).
Restaurants publish a menu per day with delivery times, customers order ahead and pay on delivery, and riders
claim deliveries from a shared queue.

| Folder | What it is |
| --- | --- |
| [`backend/`](backend/README.md) | Node.js + Express REST API with PostgreSQL |
| [`mobile/customer/`](mobile/customer/README.md) | Customer app: browse, order, pay on delivery, track |
| [`mobile/restaurant/`](mobile/restaurant/README.md) | MealDirect Partner: orders, kitchen view, menus, settings |
| [`mobile/delivery/`](mobile/delivery/README.md) | MealDirect Delivery for riders: claim, pick up, deliver, record payment |
| [`mobile/admin/`](mobile/admin/README.md) | MealDirect Admin for staff: restaurant and rider review, detail changes, cash settlement, orders, analytics |
| [`mobile/packages/shared/`](mobile/README.md) | Code the apps share: API client, session, types, helpers, theme, components |

The apps are built with Expo (React Native): they run on Android and iOS, and in a browser from the same code (see
[mobile/README.md](mobile/README.md#web-versions)). They run in Expo Go during development.

## Getting started

```bash
# Backend
cd backend
npm install
cp .env.example .env            # then fill in the values
docker compose up -d postgres   # see backend/README.md to reach it from the host

# Apps
cd ../mobile
npm install                     # every app in the workspace
```

Then start everything in one tmux session:

```bash
./dev-session.sh                       # backend + all four apps
./dev-session.sh customer restaurant   # backend + only these apps
```

Or run the pieces yourself: `npm run dev` in `backend/`, and `npx expo start` in each app's folder.

MealDirect staff accounts can't sign up in the app. Create one with `npm run create-admin` in `backend/`.

## Checks

```bash
cd backend && npm test                           # API tests
cd mobile && npm test && npm run typecheck       # every app and the shared package
```

## Deploying

- Backend: [backend/DEPLOY.md](backend/DEPLOY.md) (Docker, HTTPS, backups)
- Apps: Android test builds with EAS, see [mobile/README.md](mobile/README.md#building-the-apps-eas)

## History

The repo started as [Grub](https://github.com/sergeyCodenameOne/UberEatsClone), a Codename One UI template by
Sergey Gerashenko. That app has been replaced by the Expo apps and API above; it's still in the git history.

## License

Apache 2.0, see [LICENSE](LICENSE).
