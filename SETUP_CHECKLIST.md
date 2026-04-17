# Setup Checklist - Mess Delivery App

## 📋 Pre-Development Setup

### Linux Machine Preparation
- [ ] CPU: 4+ cores (check with `nproc`)
- [ ] RAM: 8GB+ (check with `free -h`)
- [ ] Storage: 100GB+ SSD available (check with `df -h`)
- [ ] Network: Stable 24x7 internet connection
- [ ] IP: Static IP or dynamic DNS configured

### Install Required Software
- [ ] Docker (latest LTS)
  ```bash
  curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
  ```
- [ ] Docker Compose
  ```bash
  sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  ```
- [ ] Node.js 18+ LTS
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- [ ] PostgreSQL 15 (dev/testing)
  ```bash
  sudo apt-get install -y postgresql-15
  ```
- [ ] Redis (dev/testing)
  ```bash
  sudo apt-get install -y redis-server
  ```

### Verify Installation
- [ ] Docker running: `docker --version`
- [ ] Docker Compose installed: `docker-compose --version`
- [ ] Node.js v18+: `node --version`
- [ ] NPM v9+: `npm --version`
- [ ] PostgreSQL installed: `psql --version`
- [ ] Redis installed: `redis-cli --version`

---

## 🏗️ Project Structure Setup

### Create Backend Directory
```bash
cd /path/to/UberEatsClone
mkdir -p backend
cd backend
```

### Initialize Node.js Project
- [ ] Create `package.json`
  ```bash
  npm init -y
  ```
- [ ] Update package.json with metadata
  ```json
  {
    "name": "mess-delivery-api",
    "version": "1.0.0",
    "description": "Backend API for Mess Delivery App",
    "main": "src/index.js",
    "scripts": {
      "start": "node src/index.js",
      "dev": "nodemon src/index.js",
      "test": "jest --runInBand",
      "test:watch": "jest --watch"
    }
  }
  ```

### Create Directory Structure
```bash
mkdir -p src/{config,controllers,middleware,models,routes,services,utils}
mkdir -p tests
mkdir -p migrations
mkdir -p seeds
touch src/index.js
```

### Install Core Dependencies
- [ ] Express.js
  ```bash
  npm install express dotenv cors helmet
  ```
- [ ] Database & ORM
  ```bash
  npm install pg sequelize
  ```
- [ ] Authentication
  ```bash
  npm install jsonwebtoken bcryptjs
  ```
- [ ] Validation
  ```bash
  npm install joi express-validator
  ```
- [ ] Real-time
  ```bash
  npm install socket.io
  ```
- [ ] Testing
  ```bash
  npm install --save-dev jest supertest
  ```
- [ ] Development
  ```bash
  npm install --save-dev nodemon
  ```

### Create Configuration Files
- [ ] `.env.example` (template for secrets)
  ```
  NODE_ENV=development
  PORT=3000
  DB_HOST=localhost
  DB_USER=postgres
  DB_PASSWORD=password
  DB_NAME=mess_app
  DB_PORT=5432
  REDIS_URL=redis://localhost:6379
  JWT_SECRET=your-secret-key-here
  JWT_EXPIRE=7d
  STRIPE_SECRET=sk_test_...
  STRIPE_PUBLIC=pk_test_...
  ```
- [ ] `Dockerfile`
  ```dockerfile
  FROM node:18-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --only=production
  COPY . .
  EXPOSE 3000
  CMD ["node", "src/index.js"]
  ```
- [ ] `docker-compose.yml` (from BACKEND_INFRASTRUCTURE.md)
- [ ] `.gitignore`
  ```
  node_modules/
  .env
  .env.local
  .env.*.local
  dist/
  build/
  coverage/
  .DS_Store
  ```

### Version Control
- [ ] Initialize Git
  ```bash
  git init
  ```
- [ ] First commit
  ```bash
  git add .
  git commit -m "Initial project setup"
  ```

---

## 🗄️ Database Setup (Local Development)

### PostgreSQL Setup
- [ ] Create database
  ```bash
  sudo -u postgres psql
  CREATE DATABASE mess_app;
  CREATE USER mess_user WITH PASSWORD 'secure_password';
  ALTER ROLE mess_user SET client_encoding TO 'utf8';
  ALTER ROLE mess_user SET default_transaction_isolation TO 'read committed';
  GRANT ALL PRIVILEGES ON DATABASE mess_app TO mess_user;
  \q
  ```
- [ ] Verify connection
  ```bash
  psql -h localhost -U mess_user -d mess_app
  ```

### Create Initial Schema
- [ ] Create `migrations/001_initial_schema.sql` with:
  - Users table (with role-based access)
  - Restaurants table
  - Menus table
  - Dishes table
  - Delivery slots table
  - Orders table
  - Reviews table
  - (See MESS_APP_PLAN.md for detailed schema)

- [ ] Run migrations
  ```bash
  psql -h localhost -U mess_user -d mess_app -f migrations/001_initial_schema.sql
  ```

### Backup Strategy
- [ ] Create backup directory
  ```bash
  mkdir -p backups
  ```
- [ ] Test backup script
  ```bash
  pg_dump -h localhost -U mess_user mess_app > backups/backup_$(date +%Y%m%d_%H%M%S).sql
  ```

---

## 🔐 Security Setup

### SSL/HTTPS (Let's Encrypt)
- [ ] Install Certbot
  ```bash
  sudo apt-get install -y certbot python3-certbot-nginx
  ```
- [ ] Generate certificate (when domain ready)
  ```bash
  sudo certbot certonly --standalone -d your-domain.com
  ```

### Firewall Configuration
- [ ] Install UFW
  ```bash
  sudo apt-get install -y ufw
  ```
- [ ] Configure UFW
  ```bash
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow 22/tcp  # SSH
  sudo ufw allow 80/tcp  # HTTP
  sudo ufw allow 443/tcp # HTTPS
  sudo ufw enable
  ```

### Fail2ban Setup (Rate Limiting)
- [ ] Install Fail2ban
  ```bash
  sudo apt-get install -y fail2ban
  ```
- [ ] Enable service
  ```bash
  sudo systemctl enable fail2ban
  sudo systemctl start fail2ban
  ```

### Create Secret Keys
- [ ] Generate JWT secret
  ```bash
  openssl rand -base64 32
  ```
- [ ] Generate database password
  ```bash
  openssl rand -base64 16
  ```
- [ ] Store in `.env` (NEVER commit this file)

---

## 🧪 Testing Setup

### Jest Configuration
- [ ] Create `jest.config.js`
  ```javascript
  module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    coveragePathIgnorePatterns: ['/node_modules/']
  };
  ```

### Test Database
- [ ] Create test database
  ```bash
  sudo -u postgres psql
  CREATE DATABASE mess_app_test;
  GRANT ALL PRIVILEGES ON DATABASE mess_app_test TO mess_user;
  \q
  ```

### Run First Test
- [ ] Create `tests/health.test.js` (simple health check)
- [ ] Run: `npm test`

---

## 🚀 Local Development Server

### Start Services
- [ ] PostgreSQL running
  ```bash
  sudo systemctl start postgresql
  ```
- [ ] Redis running
  ```bash
  redis-server &
  ```

### Start Development API
- [ ] Copy `.env.example` to `.env`
  ```bash
  cp .env.example .env
  ```
- [ ] Edit `.env` with local values
- [ ] Start dev server
  ```bash
  npm run dev
  ```

### Verify Health
- [ ] Test endpoint
  ```bash
  curl http://localhost:3000/api/health
  ```

---

## 📦 Docker Deployment (Local Testing)

### Build Docker Image
- [ ] Build image
  ```bash
  docker build -t mess-api:latest .
  ```
- [ ] Verify image
  ```bash
  docker images | grep mess-api
  ```

### Test with Docker Compose
- [ ] Start services
  ```bash
  docker-compose up -d
  ```
- [ ] Check status
  ```bash
  docker-compose ps
  ```
- [ ] View logs
  ```bash
  docker-compose logs -f api
  ```
- [ ] Test API
  ```bash
  curl http://localhost/api/health
  ```

### Stop Services
- [ ] Clean stop
  ```bash
  docker-compose down
  ```

---

## 📚 Documentation Review

- [ ] Read QUICK_START.md (understand overview)
- [ ] Read MESS_APP_PLAN.md (understand all features)
- [ ] Read DECISION_SUMMARY.md (understand tech choices)
- [ ] Read BACKEND_INFRASTRUCTURE.md (detailed deployment)
- [ ] Bookmark DOCUMENTATION_INDEX.md (quick reference)

---

## ✅ Pre-Development Sign-Off

Before starting Phase 1 development:

- [ ] All software installed and verified
- [ ] Project structure created
- [ ] Database created and accessible
- [ ] Docker working locally
- [ ] Documentation reviewed
- [ ] `.env.example` created (passwords not in code)
- [ ] Git repository initialized
- [ ] First commit pushed
- [ ] No hardcoded secrets in any files

---

## 🚦 Ready to Start Phase 1A

Once all items above are checked:

**Day 1-2:** Setup completed ✅
**Day 3-5:** PostgreSQL schema + JWT auth
**Day 6-10:** Core APIs
**Day 11-14:** Testing + Docker deployment

---

*Last Updated: 2026-04-17*
*Use this checklist before starting Phase 1A*
