# Phase 1B - User Authentication Action Items

**Phase:** 1B (Days 6-10 of Week 1)  
**Duration:** 5 days  
**Status:** Ready to start  
**Dependencies:** Phase 1A ✅ COMPLETE

---

## Overview

Implement complete JWT-based user authentication system with:
- User registration with email validation
- User login with password verification
- JWT token generation and refresh
- Logout functionality
- Role-based access control (RBAC)
- Comprehensive test coverage

---

## Deliverables

By end of Phase 1B, complete:

```
✓ POST /api/auth/register   - New user registration
✓ POST /api/auth/login      - User login with JWT
✓ POST /api/auth/refresh    - Refresh access token
✓ POST /api/auth/logout     - User logout
✓ authorize() middleware    - Role-based authorization
✓ User model                - Sequelize User model
✓ Auth tests                - Integration tests
```

---

## Day-by-Day Breakdown

### Day 6: User Registration

**Tasks:**
1. Create `src/models/User.js` (Sequelize model)
   - Fields: email, passwordHash, firstName, lastName, role, isActive, isVerified
   - Validations: email format, password strength
   - Methods: generateAccessToken(), generateRefreshToken()

2. Create `src/controllers/userController.js`
   - Function: registerUser(email, password, firstName, lastName)
   - Hash password with bcryptjs
   - Check for duplicate email
   - Create user in database
   - Generate JWT tokens
   - Return user + tokens

3. Create `src/routes/auth.js` endpoints
   - POST /api/auth/register
   - Request: { email, password, firstName, lastName }
   - Response: { success, data: { user, accessToken, refreshToken } }

4. Write tests in `tests/auth.test.js`
   - Valid registration
   - Duplicate email error
   - Invalid email format
   - Missing required fields
   - Password strength validation

5. Test manually
   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "password": "SecurePass123!",
       "firstName": "John",
       "lastName": "Doe"
     }'
   ```

**Success Criteria:**
- Registration endpoint returns 201 with tokens
- Password is hashed (never stored in plain text)
- Email is unique (no duplicates)
- Tests pass: `npm test`

---

### Day 7: User Login

**Tasks:**
1. Implement `src/controllers/userController.js`
   - Function: loginUser(email, password)
   - Find user by email
   - Compare password with bcrypt
   - Generate JWT tokens
   - Return user + tokens

2. Add login endpoint to `src/routes/auth.js`
   - POST /api/auth/login
   - Request: { email, password }
   - Response: { success, data: { user, accessToken, refreshToken } }
   - Error cases: user not found, invalid password

3. Extend tests in `tests/auth.test.js`
   - Valid login
   - Invalid email
   - Invalid password
   - User not found

4. Test manually
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "password": "SecurePass123!"
     }'
   ```

5. Verify tokens work
   - Use returned accessToken in Authorization header
   - Call protected endpoint (create one for testing)

**Success Criteria:**
- Login returns correct tokens
- Wrong password returns 401
- User not found returns 404
- Tests pass

---

### Day 8: Token Management

**Tasks:**
1. Implement `src/controllers/userController.js`
   - Function: refreshToken(refreshToken)
   - Verify refresh token JWT
   - Generate new access token
   - Return new access token

2. Add endpoints to `src/routes/auth.js`
   - POST /api/auth/refresh
   - POST /api/auth/logout (optional - depends on Redis)

3. Extend auth tests
   - Valid token refresh
   - Expired refresh token
   - Invalid refresh token
   - Logout (if implemented)

4. Test token expiration
   ```bash
   # Check JWT expiration
   curl -X POST http://localhost:3000/api/auth/login ...
   # Save accessToken
   # Wait 1+ second
   # Try to use expired token (mock by changing expiry to 1s in .env)
   # Should get 401 TOKEN_EXPIRED
   ```

**Success Criteria:**
- Refresh token generates new access token
- Expired tokens return 401
- Logout endpoint works (if implementing)
- Tests pass

---

### Day 9: Role-Based Access Control (RBAC)

**Tasks:**
1. Extend `src/middleware/auth.js`
   - Function: authorize(requiredRoles)
   - Check user.role in required roles
   - Return 403 if unauthorized

2. Update User model
   - Add role field: 'customer', 'restaurant_admin', 'system_admin'
   - Default: 'customer'

3. Create test endpoints to verify RBAC
   - Protected route: `GET /api/test/protected` (all roles)
   - Admin route: `GET /api/test/admin` (admin only)
   - Restaurant route: `GET /api/test/restaurant` (restaurant_admin only)

4. Write RBAC tests
   - Customer access to customer endpoint ✓
   - Customer access to admin endpoint ✗ (403)
   - Admin access to admin endpoint ✓
   - Missing token ✗ (401)

5. Test manually
   ```bash
   # Register as customer (default role)
   # Try to access admin endpoint
   # Should get 403 FORBIDDEN
   ```

**Success Criteria:**
- RBAC middleware works correctly
- Protected endpoints return 403 for insufficient permissions
- Tests pass

---

### Day 10: Integration & Polish

**Tasks:**
1. Run full test suite
   ```bash
   npm test
   # Should pass all tests with good coverage
   ```

2. Integration testing
   - Register → Login → Use token → Logout
   - Verify token expiration workflow
   - Test error cases end-to-end

3. Code review
   - Consistent error handling
   - Proper error codes in responses
   - No console.logs left (only console.error/warn)
   - Comments on complex logic

4. Documentation
   - Update API.md with auth endpoints
   - Document error codes
   - Add authentication examples

5. Cleanup
   - Remove test endpoints (test-protected, test-admin)
   - Move test data setup to seeds/
   - Verify .env.example is updated

**Success Criteria:**
- All tests pass
- Integration testing successful
- Code review approved
- Documentation updated
- Ready for Phase 2

---

## File Structure (After Phase 1B)

```
backend/
├── src/
│   ├── models/
│   │   └── User.js                    ← NEW
│   ├── controllers/
│   │   └── userController.js          ← NEW
│   ├── middleware/
│   │   ├── auth.js                    ← UPDATED
│   │   └── errorHandler.js
│   ├── routes/
│   │   └── auth.js                    ← UPDATED
│   ├── utils/
│   │   ├── tokenUtils.js
│   │   └── passwordUtils.js
│   ├── app.js                         ← UPDATED (import User model)
│   └── index.js
├── tests/
│   ├── health.test.js
│   └── auth.test.js                   ← NEW
├── seeds/
│   └── testData.js                    ← NEW (optional)
└── ...
```

---

## Testing Commands

```bash
# Run all tests
npm test

# Watch mode (auto-rerun on changes)
npm test:watch

# Coverage report
npm test:coverage

# Run specific test file
npm test -- tests/auth.test.js

# Run specific test
npm test -- --testNamePattern="register"

# Lint code
npm run lint
```

---

## API Endpoints (After Phase 1B)

### Register
```
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}

Response 201:
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "firstName": "John",
      "role": "customer"
    },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

Response 200:
{
  "success": true,
  "data": {
    "user": { ... },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

### Refresh Token
```
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGc..."
}

Response 200:
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc..."
  }
}
```

### Protected Endpoint (Example)
```
GET /api/restaurants
Authorization: Bearer <accessToken>

Response 200:
{
  "success": true,
  "data": [ ... ]
}

Response 401 (if token missing/invalid):
{
  "success": false,
  "message": "Invalid token",
  "code": "INVALID_TOKEN"
}

Response 403 (if insufficient permissions):
{
  "success": false,
  "message": "Forbidden - insufficient permissions",
  "code": "FORBIDDEN"
}
```

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| NO_TOKEN | 401 | Authorization header missing |
| INVALID_TOKEN | 401 | Token is malformed/invalid |
| TOKEN_EXPIRED | 401 | Token has expired |
| UNAUTHORIZED | 401 | Not authenticated |
| FORBIDDEN | 403 | Insufficient permissions |
| VALIDATION_ERROR | 400 | Input validation failed |
| DUPLICATE_EMAIL | 400 | Email already registered |
| USER_NOT_FOUND | 404 | User doesn't exist |
| INVALID_PASSWORD | 401 | Password is incorrect |

---

## Password Requirements

- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character (!@#$%^&*)

Example valid: `SecurePass123!`

---

## Tips & Best Practices

1. **Never log passwords or tokens**
   ```javascript
   // ✗ BAD
   console.log('Password:', password);
   
   // ✓ GOOD
   console.log('User registered:', email);
   ```

2. **Always hash passwords before storing**
   ```javascript
   const hashedPassword = await hashPassword(password);
   await User.create({ email, passwordHash: hashedPassword });
   ```

3. **Validate input on both client and server**
   - Client: UX feedback
   - Server: Security

4. **Use environment variables for secrets**
   ```javascript
   // ✓ GOOD
   const secret = process.env.JWT_SECRET;
   
   // ✗ BAD
   const secret = "hardcoded-secret";
   ```

5. **Test error cases**
   ```javascript
   // Test not just happy path
   expect(await login('', 'password')).toThrow();
   expect(await login('invalid@', 'password')).toThrow();
   ```

6. **Use meaningful error messages for debugging, not in API responses**
   ```javascript
   // ✓ GOOD - logged
   console.error('Database error:', err.message);
   
   // ✓ GOOD - sent to client (generic)
   res.status(500).json({
     success: false,
     message: 'An error occurred'
   });
   ```

---

## Checklist for Phase 1B Completion

- [ ] User model created with all fields
- [ ] User registration endpoint working
- [ ] User login endpoint working
- [ ] Token refresh endpoint working
- [ ] Logout endpoint working (if applicable)
- [ ] RBAC middleware working
- [ ] All tests passing (`npm test`)
- [ ] Code linting passing (`npm run lint`)
- [ ] No hardcoded secrets
- [ ] Error handling consistent
- [ ] API documentation updated
- [ ] Code reviewed
- [ ] Ready to commit to git

---

## Time Tracking

| Day | Task | Estimated | Actual |
|-----|------|-----------|--------|
| 6 | Registration | 8h | |
| 7 | Login | 6h | |
| 8 | Token Management | 6h | |
| 9 | RBAC | 6h | |
| 10 | Integration & Polish | 8h | |
| **TOTAL** | | **34h** | |

---

## Definition of Done

Phase 1B is complete when:

1. ✅ All 4 auth endpoints implemented and working
2. ✅ User model in database with correct fields
3. ✅ JWT token generation and validation working
4. ✅ RBAC middleware protecting endpoints
5. ✅ All tests passing with >80% coverage
6. ✅ Code reviewed and linted
7. ✅ No hardcoded secrets
8. ✅ Documentation updated
9. ✅ Ready for Phase 2 (Restaurant APIs)

---

**Ready to start Phase 1B? Let's go! 🚀**
