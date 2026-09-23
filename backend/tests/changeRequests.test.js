const request = require('supertest');
const { registerAndLogin, getAuthHeaders, cleanupAllData, TEST_PAYOUT } = require('./helpers');

let app, sequelize, models;
let adminHeaders, ownerHeaders, otherOwnerHeaders, customerHeaders;

const NEW_PAYOUT = {
  bankAccountName: 'Amma Foods',
  bankAccountNumber: '998877665544',
  bankIFSC: 'sbin0004321', // stored upper case
  upiId: 'ammafoods@oksbi',
};

const signUpRider = async (email, phone) => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'TestPass123!', firstName: 'Ravi', lastName: 'Rider', phone, role: 'delivery_partner' });
  expect(res.status).toBe(201);
  return { user: res.body.data.user, headers: getAuthHeaders({ accessToken: res.body.data.accessToken }) };
};

// Payout and personal details: free to change until approval, then reviewed by an admin
describe('Payout details and reviewed changes', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    await sequelize.sync({ force: true });

    adminHeaders = getAuthHeaders((await registerAndLogin(app, 'cr-admin@test.com', 'system_admin')).tokens);
    ownerHeaders = getAuthHeaders((await registerAndLogin(app, 'cr-owner@test.com', 'restaurant_admin')).tokens);
    otherOwnerHeaders = getAuthHeaders((await registerAndLogin(app, 'cr-other@test.com', 'restaurant_admin')).tokens);
    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'cr-cust@test.com', 'customer')).tokens);
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const newRestaurant = async (email, body = {}) => {
    const res = await request(app)
      .post('/api/restaurants')
      .set(ownerHeaders)
      .send({ name: `Kitchen ${email}`, email, city: 'Chennai', ...body });
    expect(res.status).toBe(201);
    return res.body.data;
  };
  const approve = (id) => request(app).put(`/api/restaurants/admin/${id}/approve`).set(adminHeaders);
  const setPayout = (id, body, headers = ownerHeaders) =>
    request(app).put(`/api/restaurants/${id}/bank-details`).set(headers).send(body);
  const mine = async (id) =>
    (await request(app).get('/api/restaurants/my-restaurants').set(ownerHeaders)).body.data.find((r) => r.id === id);
  const pendingRequests = async () =>
    (await request(app).get('/api/admin/change-requests').set(adminHeaders)).body.data;

  describe('restaurants', () => {
    test('need a UPI ID and bank account before they can be approved', async () => {
      const r = await newRestaurant('nopayout@test.com');
      const blocked = await approve(r.id);
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('PAYOUT_DETAILS_MISSING');

      // Before approval, details apply at once
      const saved = await setPayout(r.id, TEST_PAYOUT);
      expect(saved.status).toBe(200);
      expect(saved.body.data).toMatchObject({ applied: true, changeRequest: null });
      expect((await approve(r.id)).status).toBe(200);
    });

    test('payout details can come with the application, and all four are required', async () => {
      const r = await newRestaurant('withpayout@test.com', TEST_PAYOUT);
      expect(r).toMatchObject({ upiId: TEST_PAYOUT.upiId, bankIFSC: TEST_PAYOUT.bankIFSC });

      const partial = await setPayout(r.id, { upiId: 'only@okbank' });
      expect(partial.status).toBe(400);
      const badIfsc = await setPayout(r.id, { ...TEST_PAYOUT, bankIFSC: 'HDFC1234' });
      expect(badIfsc.status).toBe(400);
      const badUpi = await request(app)
        .post('/api/restaurants')
        .set(ownerHeaders)
        .send({ name: 'Bad UPI Kitchen', email: 'badupi@test.com', upiId: 'not-a-upi' });
      expect(badUpi.status).toBe(400);
    });

    test('after approval, a change waits for an admin and the old details stay in use', async () => {
      const r = await newRestaurant('review@test.com', TEST_PAYOUT);
      await approve(r.id);

      const sent = await setPayout(r.id, NEW_PAYOUT);
      expect(sent.status).toBe(202);
      expect(sent.body.data.applied).toBe(false);
      expect(sent.body.data.changeRequest).toMatchObject({ kind: 'payout', status: 'pending' });
      expect(sent.body.data.changeRequest.changes.bankIFSC).toBe('SBIN0004321');

      const owned = await mine(r.id);
      expect(owned.upiId).toBe(TEST_PAYOUT.upiId);
      expect(owned.changeRequests.payout).toMatchObject({ status: 'pending' });

      // Sending again updates the same request rather than queueing another
      await setPayout(r.id, { ...NEW_PAYOUT, upiId: 'ammafoods2@oksbi' });
      const queue = (await pendingRequests()).filter((q) => q.subject?.id === r.id);
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({
        subjectType: 'restaurant',
        subject: { name: 'Kitchen review@test.com' },
        current: { upiId: TEST_PAYOUT.upiId },
        changes: { upiId: 'ammafoods2@oksbi' },
      });

      const approved = await request(app).post(`/api/admin/change-requests/${queue[0].id}/approve`).set(adminHeaders).send({});
      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe('approved');

      const after = await mine(r.id);
      expect(after).toMatchObject({ upiId: 'ammafoods2@oksbi', bankAccountNumber: NEW_PAYOUT.bankAccountNumber });
      expect(after.changeRequests.payout).toBeNull();

      const twice = await request(app).post(`/api/admin/change-requests/${queue[0].id}/approve`).set(adminHeaders).send({});
      expect(twice.status).toBe(409);
    });

    test('a rejected change keeps the old details and tells the owner why', async () => {
      const r = await newRestaurant('rejected@test.com', TEST_PAYOUT);
      await approve(r.id);
      const { changeRequest } = (await setPayout(r.id, NEW_PAYOUT)).body.data;

      const noReason = await request(app).post(`/api/admin/change-requests/${changeRequest.id}/reject`).set(adminHeaders).send({});
      expect(noReason.status).toBe(400);
      await request(app)
        .post(`/api/admin/change-requests/${changeRequest.id}/reject`)
        .set(adminHeaders)
        .send({ note: 'Account name does not match the restaurant' });

      const owned = await mine(r.id);
      expect(owned.upiId).toBe(TEST_PAYOUT.upiId);
      expect(owned.changeRequests.payout).toMatchObject({
        status: 'rejected',
        reviewNote: 'Account name does not match the restaurant',
      });
    });

    test('sending the saved details again withdraws a waiting change', async () => {
      const r = await newRestaurant('withdraw@test.com', TEST_PAYOUT);
      await approve(r.id);
      await setPayout(r.id, NEW_PAYOUT);
      const back = await setPayout(r.id, TEST_PAYOUT);
      expect(back.status).toBe(202);
      expect(back.body.data.changeRequest).toBeNull();
      expect((await mine(r.id)).changeRequests.payout).toBeUndefined();

      const nothing = await setPayout(r.id, TEST_PAYOUT);
      expect(nothing.body.code).toBe('NO_CHANGES');
    });

    test("only the owner changes payout details, and only admins review", async () => {
      const r = await newRestaurant('guarded@test.com', TEST_PAYOUT);
      expect((await setPayout(r.id, NEW_PAYOUT, otherOwnerHeaders)).status).toBe(403);
      expect((await request(app).get('/api/admin/change-requests').set(ownerHeaders)).status).toBe(403);

      const pub = (await request(app).get(`/api/restaurants/${r.id}`)).body.data;
      expect(pub?.upiId).toBeUndefined();
    });
  });

  describe('riders', () => {
    test('a rider waiting for approval edits details directly', async () => {
      const { headers } = await signUpRider('cr-rider1@test.com', '9876511111');

      const personal = await request(app)
        .put('/api/profile/personal')
        .set(headers)
        .send({ firstName: 'Ravi', lastName: 'Kumar', phone: '9876522222' });
      expect(personal.status).toBe(200);
      expect(personal.body.data.profile).toMatchObject({ lastName: 'Kumar', phone: '9876522222' });

      const payout = await request(app).put('/api/profile/payout').set(headers).send(TEST_PAYOUT);
      expect(payout.status).toBe(200);
      expect(payout.body.data.profile.upiId).toBe(TEST_PAYOUT.upiId);
    });

    test('an approved rider’s changes wait for an admin', async () => {
      const { user, headers } = await signUpRider('cr-rider2@test.com', '9876533333');
      await request(app).put(`/api/admin/riders/${user.id}/approve`).set(adminHeaders);

      const sent = await request(app).put('/api/profile/payout').set(headers).send(NEW_PAYOUT);
      expect(sent.status).toBe(202);
      const personal = await request(app)
        .put('/api/profile/personal')
        .set(headers)
        .send({ firstName: 'Ravi', lastName: '', phone: '9876544444' });
      expect(personal.status).toBe(202);

      const profile = (await request(app).get('/api/profile').set(headers)).body.data;
      expect(profile).toMatchObject({ upiId: null, phone: '9876533333', lastName: 'Rider' });
      expect(profile.changeRequests.payout.status).toBe('pending');
      expect(profile.changeRequests.personal.changes).toEqual({ lastName: null, phone: '9876544444' });

      const queue = (await pendingRequests()).filter((q) => q.subject?.id === user.id);
      expect(queue.map((q) => q.kind).sort()).toEqual(['payout', 'personal']);
      for (const q of queue) {
        await request(app).post(`/api/admin/change-requests/${q.id}/approve`).set(adminHeaders).send({});
      }

      const updated = (await request(app).get('/api/profile').set(headers)).body.data;
      expect(updated).toMatchObject({ upiId: NEW_PAYOUT.upiId, bankIFSC: 'SBIN0004321', phone: '9876544444', lastName: null });

      const riders = (await request(app).get('/api/admin/riders').set(adminHeaders)).body.data;
      expect(riders.find((r) => r.id === user.id)).toMatchObject({ upiId: NEW_PAYOUT.upiId });
    });

    test('checks the details and who is asking', async () => {
      const { headers } = await signUpRider('cr-rider3@test.com', '9876555555');
      const badPhone = await request(app).put('/api/profile/personal').set(headers).send({ firstName: 'Ravi', phone: '12' });
      expect(badPhone.status).toBe(400);
      const badPayout = await request(app).put('/api/profile/payout').set(headers).send({ upiId: 'ravi@okaxis' });
      expect(badPayout.status).toBe(400);

      expect((await request(app).get('/api/profile').set(customerHeaders)).status).toBe(403);
      expect((await request(app).get('/api/profile')).status).toBe(401);
    });
  });
});
