# Strategic Decisions Summary

## 🎯 Decisions Made

### 1. Backend Framework
**Choice:** Node.js + Express.js
- **Rationale:** Fastest development cycle, great ecosystem for real-time features, suitable for growth phase (100-1K users), can scale to cloud later
- **Alternative considered:** Java Spring Boot (more verbose, steeper learning curve)
- **Database:** PostgreSQL (relational, good for complex queries, ACID transactions)
- **Cache:** Redis (session management, slot availability caching)

### 2. Infrastructure - Phase 1 (MVP)
**Choice:** Self-Hosted Docker Compose on your Linux machine
- **Rationale:** Zero cost, full control, 100-1K user capacity, easy to manage all services in containers
- **Services:** NGINX (reverse proxy) → Node.js API → PostgreSQL → Redis
- **Deployment:** Docker Compose (simpler than manual systemd setup)
- **SSL:** Let's Encrypt (free HTTPS)

### 3. Infrastructure - Phase 2 (Growth) - OPTIONAL
**Choice:** Hybrid (Self-hosted DB + AWS API)
- **Rationale:** Easy horizontal scaling, AWS manages infra, keep data private
- **Cost:** ~$120/month for API servers

### 4. Infrastructure - Phase 3 (Scale) - OPTIONAL
**Choice:** Full AWS (RDS, ElastiCache, EC2/ECS)
- **Rationale:** High-availability, auto-scaling, CDN, DDoS protection
- **Cost:** ~$550/month

---

## 💡 Why These Choices?

| Decision | Why | Considered | Rejected |
|----------|-----|-----------|----------|
| Node.js + Express | Fast iteration, real-time WebSocket support, NPM ecosystem, easy deployment | Java Spring, Python/Django | Spring too verbose for MVP, Python slower for real-time |
| PostgreSQL | ACID, complex queries (slots, orders), relational integrity | MongoDB, MySQL | NoSQL risky for financial data, MySQL less robust |
| Docker Compose | Reproducible, portable, zero setup, all-in-one | Systemd, Kubernetes | Systemd more manual, K8s overkill for MVP |
| Self-hosted MVP | Zero cost, full control, sufficient for 100-1K users | AWS from start | AWS expensive for MVP, waste if doesn't take off |
| Hybrid scaling path | Keeps data private, easy to implement, smooth growth | Full AWS now | Premature over-engineering |

---

## 🚦 Implementation Approach

### Current State
- Frontend exists (Codename One customer-only app)
- No backend (mock data only)
- No restaurant/admin interfaces

### Strategy
1. **Build backend APIs first** (Node.js + Express)
   - Serves all three roles: customer, restaurant, admin
   - RESTful APIs with clear separation
   
2. **Extend frontend** (Codename One)
   - Add restaurant admin mode
   - Add system admin mode
   - Integrate with backend APIs

3. **Deploy incrementally**
   - Each phase deployed to Linux machine
   - Test with real data
   - Scale when needed

### Risk Mitigation
- ✅ Clear API contracts (Swagger/OpenAPI)
- ✅ Comprehensive testing (Jest + integration tests)
- ✅ Database backups (daily automated)
- ✅ HTTPS from day 1 (Let's Encrypt)
- ✅ Environment separation (.env files)
- ✅ Rate limiting + auth validation

---

## 📊 Effort Breakdown (Revised with Tech Stack)

| Phase | Task | Effort (hrs) | Framework |
|-------|------|------------|-----------|
| 1 | Backend setup + DB schema | 10 | Node.js + PostgreSQL |
| 1 | User auth (JWT) | 15 | Express + bcrypt |
| 2 | Restaurant APIs | 20 | Express + Node.js |
| 2 | Menu/slot APIs | 15 | Express + Node.js |
| 2 | Order API | 20 | Express + Node.js |
| 2 | Restaurant admin UI | 30 | Codename One |
| 3 | Admin API | 20 | Express + Node.js |
| 3 | Admin UI | 25 | Codename One |
| 4 | Customer UI enhancements | 20 | Codename One |
| 4 | Reviews system | 20 | Express + Codename One |
| 5 | Payment integration | 30 | Stripe/Razorpay SDK |
| 5 | Real-time updates | 25 | Socket.io |
| 5 | Delivery tracking (optional) | 35 | Maps API |
| 6 | Testing | 50 | Jest + Supertest |
| 6 | Deployment | 25 | Docker + NGINX |
| **TOTAL** | | **395 hrs** | |

---

## 🔒 Security Architecture

### Authentication
- JWT tokens with 7-day expiry
- Refresh token rotation
- Bcrypt password hashing (12 rounds)

### Authorization
- Role-based access control (RBAC)
- Three roles: customer, restaurant_admin, system_admin
- Resource-level permissions (can't modify other restaurant's data)

### Data Protection
- HTTPS/TLS for all traffic (Let's Encrypt)
- PostgreSQL encryption at rest (optional)
- Environment variables for secrets (never in code)
- SQL parameterized queries (prevent injection)

### API Security
- JWT validation on all endpoints
- Rate limiting (100 req/min per IP)
- Input validation (Joi schemas)
- CORS configured for frontend only
- Webhook signature verification (payment callbacks)

---

## 🗓️ Timeline Overview

**Week 1-2:** Phase 1 Foundation (Backend auth, DB schema)
**Week 3-4:** Phase 1-2 Transition (Core APIs, initial tests)
**Week 5-6:** Phase 2 Restaurant (Menu API, restaurant UI)
**Week 7-8:** Phase 3 Admin (Admin APIs, admin UI)
**Week 9-10:** Phase 4 Customer (UI enhancements, reviews)
**Week 11-12:** Phase 5+ (Payment, real-time, optional features)
**Week 13+:** Testing, optimization, production hardening

**Parallel work:** Frontend and backend can be worked on simultaneously after Phase 1.

---

## 📦 Deployment Checklist (Before Production)

- [ ] Docker images built and tested locally
- [ ] Environment variables configured for production
- [ ] HTTPS certificate generated (Let's Encrypt)
- [ ] Database backups automated (daily cron)
- [ ] UFW firewall configured (80, 443, 22 only)
- [ ] Fail2ban installed for rate limiting
- [ ] PostgreSQL password is strong
- [ ] JWT secret is cryptographically random
- [ ] Payment gateway API keys secured
- [ ] CORS origins restricted to frontend domain
- [ ] Error logging configured (no sensitive data)
- [ ] Health check endpoint works (/api/health)
- [ ] Load testing done (simulate 100-1K concurrent)
- [ ] Security audit completed

---

## 🔄 Scaling Path (When Needed)

**Current (1K users):**
```
Your Linux Machine
├── NGINX
├── Node.js (single process)
├── PostgreSQL
└── Redis
```

**Growth (10K+ users):**
```
AWS Load Balancer
├── Node.js (3x EC2)
├── AWS RDS PostgreSQL
├── AWS ElastiCache Redis
└── CloudFront CDN
```

**Enterprise (100K+ users):**
```
Route53 (multi-region)
├── ALB + ASG (auto-scaling)
├── RDS (multi-AZ)
├── ElastiCache (multi-AZ)
├── S3 + CloudFront (images)
├── SQS (async jobs)
└── CloudWatch (monitoring)
```

Easy migration because of containerization and stateless APIs.

---

## ✅ Sign-Off

**Backend:** Node.js + Express.js + PostgreSQL + Redis
**Infrastructure:** Docker Compose on self-hosted Linux machine
**Payment:** Stripe or Razorpay (implementation phase)
**Deployment:** Docker Compose + NGINX + Let's Encrypt
**Scaling:** Hybrid (self-hosted → AWS) when 1K+ users

**Status:** ✅ Ready for Phase 1 Backend Development

**Next Action:** Setup backend project structure and begin Phase 1A
