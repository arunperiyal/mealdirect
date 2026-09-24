# Deploying the MealDirect API

The production stack is Postgres, the API and nginx on one Linux server with Docker, defined in
`deploy/docker-compose.prod.yml`. It works on any VPS: DigitalOcean, Hetzner, AWS Lightsail and so on. A
managed platform such as Render or Railway can run the same `Dockerfile` with its own Postgres.

This setup was tested end to end on a local machine: all four apps' contract tests passed through nginx.

## What you need

- A server with Docker and the compose plugin (2 GB RAM is plenty to start)
- A domain name pointing at the server, e.g. `api.yourdomain.com`. You need it for HTTPS, which Android apps
  and Razorpay webhooks require.
- Ports 80 and 443 open

## First deploy

All commands run on the server, in `backend/deploy/`.

1. **Settings.** Copy the example and fill in every value:

   ```bash
   cp .env.production.example .env.production
   chmod 600 .env.production
   openssl rand -base64 48   # run twice: JWT_SECRET and JWT_REFRESH_SECRET (must differ)
   openssl rand -base64 32   # DB_PASSWORD
   ```

   The API refuses to start if a secret is missing, shorter than 32 characters, or one of the example values
   from this repo, and it prints what's wrong.

2. **Create the database schema**, then start everything:

   ```bash
   alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production'
   dc build
   dc run --rm api node scripts/upgrade-db.js
   dc up -d
   curl http://localhost/api/health
   ```

3. **First admin account.** Admins can't sign up in the apps:

   ```bash
   read -s ADMIN_PASSWORD   # at least 12 characters
   dc exec -e ADMIN_PASSWORD="$ADMIN_PASSWORD" api node scripts/create-admin.js --email you@yourdomain.com
   unset ADMIN_PASSWORD
   ```

4. **HTTPS** with a free Let's Encrypt certificate:

   ```bash
   docker run --rm \
     -v "$PWD/certbot/www:/var/www/certbot" -v "$PWD/certbot/conf:/etc/letsencrypt" \
     certbot/certbot certonly --webroot -w /var/www/certbot \
     -d api.yourdomain.com --email you@yourdomain.com --agree-tos --no-eff-email

   cp nginx/https.conf.example nginx/conf.d/https.conf
   sed -i 's/api.example.com/api.yourdomain.com/g' nginx/conf.d/https.conf
   # In nginx/conf.d/api.conf, replace the `location /` block with: return 301 https://$host$request_uri;
   dc exec nginx nginx -s reload
   curl https://api.yourdomain.com/api/health
   ```

   Certificates last 90 days. Renew them with a daily cron job:

   ```bash
   0 3 * * * cd /path/to/backend/deploy && docker run --rm -v "$PWD/certbot/www:/var/www/certbot" -v "$PWD/certbot/conf:/etc/letsencrypt" certbot/certbot renew --quiet && docker compose -f docker-compose.prod.yml --env-file .env.production exec nginx nginx -s reload
   ```

5. **Razorpay.** In the Razorpay dashboard (test mode first):
   - Copy the key ID and secret into `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
   - Under **Webhooks**, add `https://api.yourdomain.com/api/payments/webhook` with a secret, and pick the
     events `payment.authorized`, `payment.captured` and `payment.failed`. Put that secret in
     `RAZORPAY_WEBHOOK_SECRET`. It's required with live keys, because without it a customer who closes the
     app right after paying may never see the order confirmed.
   - Apply the changes: `dc up -d api`.

6. **Point the apps at the server.** Set `EXPO_PUBLIC_API_URL=https://api.yourdomain.com` for the app
   builds (see `mobile/README.md`).

## Updating

```bash
git pull
dc build
dc run --rm api node scripts/upgrade-db.js   # always before starting the new version
dc up -d
```

`upgrade-db` is safe to run every time. Schema changes are never applied automatically in production.

## Backups

Keep a nightly database dump somewhere other than the server:

```bash
0 2 * * * cd /path/to/backend/deploy && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres pg_dump -U mealdirect -Fc mealdirect > /backups/mealdirect-$(date +\%F).dump
```

Restore with `pg_restore -U mealdirect -d mealdirect --clean <file>` inside the postgres container.

## What's in place

| Area | How |
| --- | --- |
| Secrets | Checked at startup; never in the image (`.dockerignore`), only in `.env.production` |
| Database | Not reachable from outside; schema changes through `upgrade-db` |
| Rate limits | Sign-in, sign-up and token refresh: 20 per 15 min per IP. Creating and verifying payments: 30. nginx passes the real client IP (`TRUST_PROXY=1`) |
| Container | Node 22, production dependencies only, runs as a non-root user, health check |
| HTTPS | nginx with Let's Encrypt, HSTS |

### Web apps

The apps also build as static websites (`npm run build:web` in each app folder, with `EXPO_PUBLIC_API_URL` set to
the API's `https://` address). Host each on its own address, since browser sign-in is stored per origin, and
answer unknown paths with `index.html` (in nginx: `try_files $uri /index.html;`). List those addresses in
`CORS_ORIGINS`. Where to host them hasn't been decided yet.

Still to do before real customers: monitoring and alerts, off-server backups, and automating refunds for
cancelled paid orders (they're manual for now).
