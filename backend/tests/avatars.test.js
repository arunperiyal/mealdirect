const request = require('supertest');
const { registerAndLogin, getAuthHeaders, cleanupAllData } = require('./helpers');

let app, sequelize, models;
let user, headers;

// Smallest valid files of each kind: only the first bytes are checked
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60, 2)]);

describe('Profile pictures', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    await sequelize.sync({ force: true });
    const signup = await registerAndLogin(app, 'face@test.com', 'customer');
    user = signup.user;
    headers = getAuthHeaders(signup.tokens);
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const upload = (image) => request(app).put('/api/auth/me/avatar').set(headers).send({ image });

  test('no picture to begin with', async () => {
    const me = await request(app).get('/api/auth/me').set(headers);
    expect(me.body.data.user.avatarUrl).toBeNull();
    expect((await request(app).get(`/api/avatars/${user.id}`)).status).toBe(404);
  });

  test('uploads a picture that anyone can load from its URL, and replaces it', async () => {
    const res = await upload(`data:image/jpeg;base64,${JPEG.toString('base64')}`);
    expect(res.status).toBe(200);
    const { avatarUrl } = res.body.data.user;
    expect(avatarUrl).toMatch(new RegExp(`^/api/avatars/${user.id}\\?v=\\d+$`));

    const image = await request(app).get(avatarUrl);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    expect(image.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(Buffer.compare(image.body, JPEG)).toBe(0);

    await new Promise((r) => setTimeout(r, 5));
    const replaced = await upload(PNG.toString('base64'));
    expect(replaced.body.data.user.avatarUrl).not.toBe(avatarUrl);
    const png = await request(app).get(replaced.body.data.user.avatarUrl);
    expect(png.headers['content-type']).toBe('image/png');

    const me = await request(app).get('/api/auth/me').set(headers);
    expect(me.body.data.user.avatarUrl).toBe(replaced.body.data.user.avatarUrl);
  });

  test('refuses files that are not pictures, and pictures over 1 MB', async () => {
    const text = await upload(Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'));
    expect(text.status).toBe(400);
    expect(text.body.code).toBe('INVALID_IMAGE');

    const huge = await upload(Buffer.concat([JPEG, Buffer.alloc(1024 * 1024)]).toString('base64'));
    expect(huge.status).toBe(413);
    expect(huge.body.code).toBe('IMAGE_TOO_LARGE');

    expect((await request(app).put('/api/auth/me/avatar').send({ image: JPEG.toString('base64') })).status).toBe(401);
  });

  test('comes with a user loaded with only a few fields, as on orders', async () => {
    const loaded = await models.User.findByPk(user.id, { attributes: ['id', 'firstName', 'avatarUrl'] });
    expect(loaded.get({ plain: true }).avatarUrl).toMatch(/^\/api\/avatars\//);
  });

  test('removes the picture', async () => {
    const res = await request(app).delete('/api/auth/me/avatar').set(headers);
    expect(res.body.data.user.avatarUrl).toBeNull();
    expect((await request(app).get(`/api/avatars/${user.id}`)).status).toBe(404);
  });
});
