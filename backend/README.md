# Mess Delivery App - Backend API

Node.js + Express.js REST API for the mess delivery application.

## Quick Start

### Prerequisites
- Node.js 18+ LTS
- Docker & Docker Compose (for deployment)
- PostgreSQL 15 (local development)
- Redis 7 (local development)

### Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Setup environment**
   ```bash
   cp .env.example .env
   # Edit .env with your local database credentials
   ```

3. **Create local database**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE mess_app;
   CREATE USER mess_user WITH PASSWORD 'password';
   GRANT ALL PRIVILEGES ON DATABASE mess_app TO mess_user;
   \q
   ```

4. **Run database schema**
   ```bash
   psql -h localhost -U mess_user -d mess_app -f migrations/001_initial_schema.sql
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

   Server runs on `http://localhost:3000`

6. **Test health endpoint**
   ```bash
   curl http://localhost:3000/api/health
   ```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm test:watch

# Coverage report
npm test:coverage
```

### Linting

```bash
npm run lint
```

## Production

See **[DEPLOY.md](DEPLOY.md)** for deploying to a server (HTTPS, Razorpay, backups).

## Local database with Docker

`docker-compose.yml` runs the development Postgres (and Redis). Run the API itself with `npm run dev`, which
brings the schema up to date on start.

```bash
docker compose up -d postgres
npm run dev
```

The database isn't exposed to the network by default. To reach it from `npm run dev` on the host, add a
`docker-compose.override.yml`. It isn't committed, so it only affects your machine:

```yaml
services:
  postgres:
    ports:
      - "127.0.0.1:5434:5432"
```

Then set `DB_HOST=localhost` and `DB_PORT=5434` in `.env`.

## Project Structure

```
backend/
├── src/
│   ├── config/              # Configuration files
│   │   ├── index.js         # Main config
│   │   └── database.js      # Sequelize setup
│   ├── controllers/         # Request handlers
│   ├── middleware/          # Express middleware
│   │   ├── auth.js          # JWT and authorization
│   │   └── errorHandler.js  # Error handling
│   ├── models/              # Sequelize models
│   ├── routes/              # API endpoints
│   │   └── auth.js          # Auth routes
│   ├── services/            # Business logic
│   ├── utils/               # Helper functions
│   │   ├── tokenUtils.js    # JWT utilities
│   │   └── passwordUtils.js # Password hashing
│   ├── app.js               # Express app setup
│   └── index.js             # Entry point
├── tests/                   # Jest tests
├── migrations/              # Database migrations
│   └── 001_initial_schema.sql
├── seeds/                   # Demo data
├── docker-compose.yml       # Docker Compose config
├── Dockerfile               # Docker image
├── jest.config.js           # Jest configuration
└── package.json
```

## API Endpoints (Phase 1 - To Be Implemented)

### Health Check
- `GET /api/health` - Health check endpoint

### Authentication (Phase 1B)
- `POST /api/auth/register` - User registration (`role` may be `customer` or `restaurant_admin`; defaults to `customer`)
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout

### Restaurants (Phase 2)
- `GET /api/restaurants` - List restaurants
- `GET /api/restaurants/:id` - Restaurant details
- `POST /api/restaurants` - Create restaurant (admin)
- `PUT /api/restaurants/:id` - Update restaurant

### Menus (Phase 2)
- `GET /api/menus/:date` - Get menus for date
- `POST /api/menus` - Create menu (restaurant admin)
- `GET /api/menus/:id/slots` - Get delivery slots
- `POST /api/menus/:id/slots` - Create delivery slot

### Orders (Phase 2)
- `POST /api/orders` - Create order
- `GET /api/orders/:id` - Get order details
- `GET /api/my-orders` - Customer's orders
- `PUT /api/orders/:id/status` - Update order status (admin)

### Reviews (Phase 4)
- `POST /api/reviews` - Submit review
- `GET /api/restaurants/:id/reviews` - Restaurant reviews
- `GET /api/dishes/:id/reviews` - Dish reviews

## Database Schema

See `migrations/001_initial_schema.sql` for complete schema including:
- Users (with role-based access)
- Restaurants
- Menus & Delivery Slots
- Dishes & Order Items
- Orders & Payments
- Reviews & Ratings

## Environment Variables

See `.env.example` for all configuration options.

Key variables:
- `NODE_ENV` - Environment (development/production)
- `PORT` - API port
- `DB_*` - Database credentials
- `JWT_SECRET` - JWT signing key
- `REDIS_URL` - Redis connection
- `STRIPE_SECRET` - Stripe API key

## Error Handling

All endpoints return standardized JSON responses:

**Success:**
```json
{
  "success": true,
  "data": { /* response data */ }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

## Security

- JWT token-based authentication
- Bcrypt password hashing (12 rounds)
- CORS configured
- Helmet.js for security headers
- Input validation with Joi
- SQL injection prevention (Sequelize parameterized queries)
- System admins can't self-register. Create them from the server:

  ```bash
  read -s ADMIN_PASSWORD && export ADMIN_PASSWORD   # at least 12 characters
  npm run create-admin -- --email admin@example.com --first-name Asha --last-name Rao
  ```
- After pulling changes that touch the models, bring an existing Postgres database up to date (safe to re-run):

  ```bash
  npm run upgrade-db
  ```

  Development startup only creates missing tables; it doesn't change existing ones.
- There's no self-service password reset yet. To set a new password for any account:

  ```bash
  read -s NEW_PASSWORD && export NEW_PASSWORD   # at least 8 characters (12 for admins)
  npm run reset-password -- --email someone@example.com
  ```

## Development Workflow

1. Create feature branch: `git checkout -b feature/auth-system`
2. Make changes and write tests
3. Run tests: `npm test`
4. Commit: `git commit -m "feat: implement auth system"`
5. Push and create PR

## Troubleshooting

### Database connection error
- Ensure PostgreSQL is running: `sudo systemctl start postgresql`
- Check credentials in `.env`
- Verify database exists: `psql -h localhost -U mess_user -d mess_app`

### Port already in use
- Change PORT in `.env` or stop other services on 3000

### Docker Compose issues
- Check Docker daemon: `docker ps`
- View logs: `docker-compose logs -f`
- Rebuild: `docker-compose build --no-cache`

## Resources

- [MESS_APP_PLAN.md](../MESS_APP_PLAN.md) - Full feature roadmap
- [BACKEND_INFRASTRUCTURE.md](../BACKEND_INFRASTRUCTURE.md) - Deployment guide
- [Express Documentation](https://expressjs.com/)
- [Sequelize Documentation](https://sequelize.org/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc7519)

## Phase 1 Status

- ✅ Phase 1A: Backend structure & configuration
- ⏳ Phase 1B: User authentication & JWT (next)
- ⏳ Phase 1B: Core APIs

---

*Phase 1 Backend - Started April 17, 2026*
