'use strict';
const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../app');
const { createStore } = require('../store');

function freshApp(env = {}) {
  return createApp({ store: createStore(null), env });
}

describe('health & info', () => {
  test('GET /health returns ok', async () => {
    const res = await request(freshApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  test('GET /api/info exposes build metadata and only whitelisted env', async () => {
    const app = freshApp({ GIT_COMMIT: 'abc123', APP_ENV: 'staging', SECRET_KEY: 'nope' });
    const res = await request(app).get('/api/info');
    expect(res.status).toBe(200);
    expect(res.body.commit).toBe('abc123');
    expect(res.body.environment).toBe('staging');
    expect(res.body.version).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('nope');
  });

  test('serves the dashboard', async () => {
    const res = await request(freshApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Cloud CI/CD Dashboard');
  });
});

describe('counter', () => {
  test('increments and resets', async () => {
    const app = freshApp();
    expect((await request(app).get('/api/counter')).body.value).toBe(0);
    await request(app).post('/api/counter/increment');
    const inc = await request(app).post('/api/counter/increment');
    expect(inc.body.value).toBe(2);
    const reset = await request(app).post('/api/counter/reset');
    expect(reset.body.value).toBe(0);
  });
});

describe('messages', () => {
  test('create, list (newest first) and delete', async () => {
    const app = freshApp();
    const a = await request(app).post('/api/messages').send({ author: 'Ann', text: 'first' });
    expect(a.status).toBe(201);
    await request(app).post('/api/messages').send({ text: 'second' });

    const list = await request(app).get('/api/messages');
    expect(list.body).toHaveLength(2);
    expect(list.body[0].text).toBe('second');
    expect(list.body[0].author).toBe('Anonymous');

    expect((await request(app).delete(`/api/messages/${a.body.id}`)).status).toBe(204);
    expect((await request(app).get('/api/messages')).body).toHaveLength(1);
  });

  test('rejects empty or oversized text', async () => {
    const app = freshApp();
    expect((await request(app).post('/api/messages').send({ text: '   ' })).status).toBe(400);
    expect(
      (await request(app).post('/api/messages').send({ text: 'x'.repeat(281) })).status
    ).toBe(400);
  });

  test('delete of unknown id returns 404, bad id returns 400', async () => {
    const app = freshApp();
    expect((await request(app).delete('/api/messages/999')).status).toBe(404);
    expect((await request(app).delete('/api/messages/abc')).status).toBe(400);
  });

  test('invalid JSON returns 400', async () => {
    const res = await request(freshApp())
      .post('/api/messages')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
  });
});

describe('misc', () => {
  test('unknown API route returns 404 JSON', async () => {
    const res = await request(freshApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not found');
  });
});

describe('persistence', () => {
  test('data survives a "restart" (new store on same file)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
    const file = path.join(dir, 'db.json');

    const first = createStore(file);
    first.incrementCounter();
    first.incrementCounter();
    first.addMessage('Bob', 'persisted');

    const second = createStore(file);
    expect(second.getCounter()).toBe(2);
    expect(second.listMessages()[0].text).toBe('persisted');

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
