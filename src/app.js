const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const session = require('express-session');

const { ServiceError } = require('./services/errors');
const { authRoutes } = require('./routes/auth');
const { eventRoutes } = require('./routes/events');
const { pageRoutes } = require('./routes/pages');
const { suggestionRoutes } = require('./routes/suggestions');
const healthData = require('./data/health');

function createApp({
  auth = require('./services/auth').createAuthService({
    users: require('./data/users'),
  }),
  events = require('./services/events').createEventService({
    events: require('./data/events'),
  }),
  registrations = require('./services/registrations').createRegistrationService({
    registrations: require('./data/registrations'),
  }),
  suggestions = require('./services/suggestions').createSuggestionService({
    client: require('./model/gemini').createGeminiClient(),
  }),
  health = healthData,
} = {}) {
  const app = express();
  // The codespace's forwarded port is HTTPS in front of plain HTTP: trust that one proxy,
  // so a cookie marked secure is still sent.
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(
    session({
      name: 'sid',
      // A random secret per start when none is set: sessions then simply end on restart.
      secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 8 * 60 * 60 * 1000 },
    }),
  );
  app.use('/assets', express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', async (_req, res) => {
    let timeout;
    try {
      await Promise.race([
        health.checkDatabase(),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Database health check timed out.')),
            healthData.HEALTH_TIMEOUT_MS,
          );
        }),
      ]);
      res.json({ status: 'ok', db: 'ok' });
    } catch (error) {
      console.error(error);
      res.status(503).json({ status: 'error', db: 'down' });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.use(pageRoutes({ auth }));
  app.use(authRoutes({ auth }));
  app.use(eventRoutes({ auth, events, registrations }));
  app.use(suggestionRoutes({ auth, suggestions }));

  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

  // A ServiceError is a refusal the user should read; anything else is our bug.
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error instanceof ServiceError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.parse.failed') {
      console.error(error);
      return res.status(400).json({ error: 'The request body is not valid JSON.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  });

  return app;
}

module.exports = { createApp };
