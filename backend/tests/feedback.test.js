// Low limit for this file only; set before the app is loaded
process.env.RATE_LIMIT_FEEDBACK_MAX = '6';
process.env.FEEDBACK_EMAIL = 'inbox@mealdirect.test';

const request = require('supertest');

let app, sequelize, outbox;

// The website's suggestions and feedback form
describe('Feedback', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    ({ outbox } = require('../src/lib/mailer'));
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  const send = (body) => request(app).post('/api/feedback').send(body);

  test('emails the message to the inbox, replying to the sender', async () => {
    const res = await send({ kind: 'suggestion', message: 'Please add a breakfast filter.', name: 'Asha', email: 'Asha@Example.com' });
    expect(res.status).toBe(200);
    expect(outbox.at(-1)).toMatchObject({
      to: 'inbox@mealdirect.test',
      replyTo: 'asha@example.com',
      subject: 'MealDirect website: Suggestion from Asha',
    });
    expect(outbox.at(-1).text).toBe('Suggestion from Asha <asha@example.com>:\n\nPlease add a breakfast filter.');
  });

  test('name and email are optional', async () => {
    expect((await send({ kind: 'problem', message: 'The app logged me out twice.' })).status).toBe(200);
    expect(outbox.at(-1)).toMatchObject({ subject: 'MealDirect website: Problem report', replyTo: undefined });
    expect(outbox.at(-1).text).toMatch(/^Problem report from someone who left no name or email:/);
  });

  test('rejects a bad kind, a short message or a bad email', async () => {
    const before = outbox.length;
    for (const body of [
      { kind: 'spam', message: 'A long enough message.' },
      { kind: 'feedback', message: 'short' },
      { kind: 'feedback', message: 'A long enough message.', email: 'not-an-email' },
    ]) {
      const res = await send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(outbox.length).toBe(before);
  });

  test('a filled-in hidden field looks sent, but nothing is emailed', async () => {
    const before = outbox.length;
    expect((await send({ kind: 'feedback', message: 'Buy cheap things now!!', website: 'http://spam.example' })).status).toBe(200);
    expect(outbox.length).toBe(before);
  });

  test('too many messages from one client are refused', async () => {
    const res = await send({ kind: 'feedback', message: 'One message too many.' });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });
});
