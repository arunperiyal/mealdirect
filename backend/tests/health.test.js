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

describe('Auth Routes - Placeholder', () => {
  it('should indicate register endpoint is not implemented', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    expect(response.statusCode).toBe(501);
    expect(response.body.success).toBe(false);
  });

  it('should indicate login endpoint is not implemented', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    expect(response.statusCode).toBe(501);
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
