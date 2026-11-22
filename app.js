'use strict';
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const pkg = require('./package.json');
const { createStore } = require('./store');

const SAFE_ENV_KEYS = ['NODE_ENV', 'PORT', 'APP_ENV', 'GIT_COMMIT', 'BUILD_TIME'];

function createApp({ store = createStore(null), env = process.env } = {}) {
  const app = express();
  const startedAt = new Date();

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://cdn.tailwindcss.com'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          'upgrade-insecure-requests': null,
        },
      },
    })
  );
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Liveness/readiness probe (used by Docker HEALTHCHECK and the load balancer)
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Build + runtime info for the dashboard (whitelisted env vars only: no secrets)
  app.get('/api/info', (_req, res) => {
    const safeEnv = {};
    for (const key of SAFE_ENV_KEYS) safeEnv[key] = env[key] || null;
    res.json({
      name: pkg.name,
      version: pkg.version,
      commit: env.GIT_COMMIT || 'unknown',
      buildTime: env.BUILD_TIME || 'unknown',
      environment: env.APP_ENV || env.NODE_ENV || 'development',
      nodeVersion: process.version,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      env: safeEnv,
    });
  });

  // Counter (state persistence demo)
  app.get('/api/counter', (_req, res) => res.json({ value: store.getCounter() }));
  app.post('/api/counter/increment', (_req, res) =>
    res.json({ value: store.incrementCounter() })
  );
  app.post('/api/counter/reset', (_req, res) =>
    res.json({ value: store.resetCounter() })
  );

  // Message board
  app.get('/api/messages', (_req, res) => res.json(store.listMessages()));
  app.post('/api/messages', (req, res) => {
    const body = req.body || {};
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    let author = typeof body.author === 'string' ? body.author.trim() : '';
    if (!author) author = 'Anonymous';
    if (!text || text.length > 280) {
      return res.status(400).json({ error: 'text is required (1-280 characters)' });
    }
    if (author.length > 40) {
      return res.status(400).json({ error: 'author must be at most 40 characters' });
    }
    return res.status(201).json(store.addMessage(author, text));
  });
  app.delete('/api/messages/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    return store.deleteMessage(id)
      ? res.status(204).end()
      : res.status(404).json({ error: 'message not found' });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid JSON' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };
