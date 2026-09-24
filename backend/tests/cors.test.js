const request = require('supertest');

// Browsers only let the web apps read API responses when CORS allows their origin
describe('CORS for the web apps', () => {
  test('development and tests allow any origin, such as the Expo web dev servers', async () => {
    const app = require('../src/app');
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:8082');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8082');

    const preflight = await request(app)
      .options('/api/orders')
      .set('Origin', 'http://192.168.0.205:8081')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });

  test('production allows only CORS_ORIGINS', () => {
    const saved = { ...process.env };
    try {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ORIGINS = 'https://app.mealdirect.in, https://partner.mealdirect.in/';
      jest.isolateModules(() => {
        const config = require('../src/config');
        expect(config.cors.origin).toEqual(['https://app.mealdirect.in', 'https://partner.mealdirect.in']);
      });
    } finally {
      process.env = saved;
    }
  });

  test('the production check warns when no web origin is set', () => {
    const { checkProductionConfig } = require('../src/config/validate');
    const { warnings } = checkProductionConfig({ NODE_ENV: 'production' });
    expect(warnings.join('\n')).toMatch(/CORS_ORIGINS is not set/);
    expect(checkProductionConfig({ CORS_ORIGINS: 'https://app.mealdirect.in' }).warnings.join('\n')).not.toMatch(/CORS/);
  });
});
