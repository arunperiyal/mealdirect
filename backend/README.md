# MealDirect backend API

Node.js + Express REST API with PostgreSQL (Sequelize) for the MealDirect apps: customers, restaurant partners,
delivery riders and MealDirect staff.

## Quick start

Needs Node.js 18+ and Docker (for the development database).

```bash
npm install
cp .env.example .env        # then fill in the values
docker compose up -d postgres
npm run dev                 # http://localhost:3000, restarts on changes
curl http://localhost:3000/api/health
```

To run the API and the Expo apps together in tmux, use `./dev-session.sh` from the repo root (see
`mobile/README.md`).

### Reaching the database from the host

`docker-compose.yml` runs Postgres (and Redis, which the API doesn't use yet) without exposing it to the network.
To reach it from `npm run dev` on the host, add a `docker-compose.override.yml`. It isn't committed, so it only
affects your machine:

```yaml
services:
  postgres:
    ports:
      - "127.0.0.1:5434:5432"
```

Then set `DB_HOST=localhost` and `DB_PORT=5434` in `.env`.

### Database schema

There are no hand-written migrations. A new database is created from the models in `src/models/`. Changes to
existing databases are idempotent SQL steps in `src/db/upgrade.js`: add new steps at the end and never edit a
released one.

- `npm run dev` brings the schema up to date on start.
- In production, run `npm run upgrade-db` as a deploy step. It's safe to run again.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API with auto-restart (nodemon) |
| `npm start` | API without auto-restart |
| `npm test` | Jest + Supertest on in-memory SQLite, one suite at a time (plain `npx jest` runs suites in parallel and they clash) |
| `npm run lint` | ESLint |
| `npm run upgrade-db` | Bring an existing Postgres database up to date |
| `npm run create-admin` | Create a MealDirect staff account (system admins can't sign up) |
| `npm run reset-password` | Set a new password for any account (there's no self-service reset yet) |

Both account scripts read the password from the environment, so it never appears in your shell history:

```bash
read -s ADMIN_PASSWORD && export ADMIN_PASSWORD     # at least 12 characters
npm run create-admin -- --email admin@example.com --first-name Asha --last-name Rao

read -s NEW_PASSWORD && export NEW_PASSWORD         # at least 8 characters (12 for admins)
npm run reset-password -- --email someone@example.com
```

## Production

See **[DEPLOY.md](DEPLOY.md)** for deploying to a server: Docker, HTTPS with Let's Encrypt, Razorpay and
backups.

## Configuration

`.env.example` lists every setting. The main ones:

| Variable | Purpose |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Token signing keys (production refuses weak or example ones) |
| `ONLINE_PAYMENTS_ENABLED`, `RAZORPAY_*` | Online payment. Off for now: customers pay on delivery. |
| `MEALDIRECT_UPI_ID`, `MEALDIRECT_UPI_NAME` | The UPI account customers pay at the door (QR code on the rider's phone) |
| `BUSINESS_UTC_OFFSET_MINUTES` | The business day for cash settlement, order cutoffs and auto-ready (330 = India) |
| `AUTO_READY_JOB` | `false` stops the job that marks orders ready before their delivery time |
| `TRUST_PROXY` | Number of reverse proxies in front of the API, so rate limits see the real client IP |

## How orders work

- **Menus** are per day. A restaurant adds dishes and delivery times (each with an order limit), then publishes.
  Orders close at the menu's ordering end time on the menu's day (`409 ORDERING_CLOSED`).
- **Order status:** pending → confirmed → preparing → ready → out for delivery → delivered (or picked up), or
  cancelled.
- **Pay on delivery:** the rider records cash, UPI to MealDirect, or **Not paid**. Pickup orders and restaurant
  self-deliveries are recorded by the restaurant. A customer with an unresolved not-paid order can't place new
  orders. Riders settle cash with MealDirect daily and can't claim new orders while holding cash from an earlier
  day. Admins record settlements and resolve disputes.
- **Order handling settings** (per restaurant, off by default): auto-accept pay-on-delivery orders, and mark
  accepted delivery orders ready a set number of minutes before their delivery time.
- **Riders** claim orders from a shared queue. On Postgres, two riders can't claim the same order.

## API

All responses are JSON: `{ "success": true, "data": ... }` or
`{ "success": false, "code": "ERROR_CODE", "message": "..." }`. Send the access token as
`Authorization: Bearer <token>`.

### Public
- `GET /api/health`: health check
- `GET /api/config`: which payment options the apps should offer, and MealDirect's UPI details

### Auth
- `POST /api/auth/register`: sign up as `customer` (default), `restaurant_admin` or `delivery_partner` (needs a
  phone number)
- `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`

### Restaurants
- `GET /api/restaurants`, `GET /api/restaurants/:id`: public listing and details
- `POST /api/restaurants`, `GET /api/restaurants/my-restaurants`: an owner's restaurants
- `PUT /api/restaurants/:id`, and `PUT /api/restaurants/:id/` + `operating-hours`, `delivery-settings`,
  `order-settings`, `bank-details`: owner settings
- `PUT /api/restaurants/admin/:id/approve`, `PUT /api/restaurants/admin/:id/reject`: admin review

### Menus
- `GET /api/menus?restaurantId=&date=` (or `from`/`to`), `GET /api/menus/:id`
- `POST /api/menus`, `PUT /api/menus/:id`, `POST /api/menus/:id/publish`, `POST /api/menus/:id/close`
- `POST /api/menus/:id/items`, `PUT /api/menus/:id/items/:itemId`, `DELETE /api/menus/:id/items/:itemId`
- `GET /api/menus/:id/slots`, `POST /api/menus/:id/slots`, `PUT /api/menus/slots/:id`,
  `DELETE /api/menus/slots/:id`: delivery times

### Orders
- Customer: `POST /api/orders`, `GET /api/orders` (their own), `GET /api/orders/:id`, `PUT /api/orders/:id`
  (before it's accepted), `POST /api/orders/:id/cancel`, `POST /api/orders/:id/mark-picked-up`
- Restaurant: `GET /api/orders/restaurant-orders`, and `POST /api/orders/:id/` + `confirm`, `mark-preparing`,
  `mark-ready`, `mark-out-for-delivery`, `mark-delivered`, `record-payment`, `cancel`
- Kitchen: `GET /api/orders/kitchen?restaurantId=&date=` (a day's dish totals, and orders grouped by delivery time
  and pickup), `POST /api/orders/bulk` (accept, or mark ready, one whole group)
- Admin: `GET /api/orders/admin/orders`

### Delivery (riders)
- `GET /api/delivery/available`: the queue of orders to claim
- `GET /api/delivery/orders`, `GET /api/delivery/orders/:id`: the rider's orders
- `POST /api/delivery/orders/:id/` + `claim`, `release`, `pick-up`, `deliver` (with the payment collected)
- `GET /api/delivery/balance`: cash held and whether settlement is due

### Admin
- `GET /api/admin/restaurants`, `GET /api/admin/restaurants/:id`, `GET /api/admin/analytics`
- `GET /api/admin/riders`, `PUT /api/admin/riders/:id/approve`, `PUT /api/admin/riders/:id/suspend`
- `GET /api/admin/riders/:id/cash`, `POST /api/admin/riders/:id/settlements`
- `POST /api/admin/orders/:id/resolve-payment`

### Payments (Razorpay, on hold)
- `POST /api/payments/create-order`, `POST /api/payments/verify-payment`, `GET /api/payments/status/:orderId`
- `POST /api/payments/webhook`: signed by Razorpay

## Project structure

```
backend/
├── src/
│   ├── app.js, index.js   # Express app; server start, background jobs, graceful shutdown
│   ├── config/            # Settings, database connection, production checks
│   ├── controllers/       # Business logic per area
│   ├── db/upgrade.js      # Schema upgrade steps
│   ├── jobs/              # Background jobs (auto-ready)
│   ├── lib/               # Business time, ordering cutoff
│   ├── middleware/        # Auth, rate limits, errors
│   ├── models/            # Sequelize models
│   ├── routes/            # Endpoints and input validation
│   ├── services/          # Razorpay client
│   └── utils/             # Tokens, password hashing
├── scripts/               # create-admin, reset-password, upgrade-db
├── tests/                 # Jest + Supertest
├── deploy/                # Production Docker Compose, nginx, certbot
└── docker-compose.yml     # Development database
```

## Security

- JWT access and refresh tokens; bcrypt password hashing
- Helmet headers, CORS, rate limits on auth and payment endpoints
- Input validation with express-validator; parameterised queries through Sequelize
- Role checks on every endpoint; system admins are only created from the server
- Production refuses to start with missing, weak or example secrets (`src/config/validate.js`)
