const request = require('supertest');
const app = require('../src/app');

describe('API Health Check', () => {
  it('should return 200 and success message', async () => {
    const response = await request(app)
      .get('/api/health');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('healthy');
  });
});

describe('Auth Endpoints - Basic Validation', () => {
  it('should reject register with invalid email', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'invalid-email',
        password: 'ValidPass123!'
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should reject login with missing fields', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com'
        // Missing password
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
  });
});

describe('404 Handling', () => {
  it('should return 404 for unknown routes', async () => {
    const response = await request(app)
      .get('/api/unknown-route');

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });
});

