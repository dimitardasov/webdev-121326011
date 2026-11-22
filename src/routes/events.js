const express = require('express');

function eventRoutes({ auth, events, registrations }) {
  const router = express.Router();

  router.get('/api/events', async (req, res, next) => {
    try {
      const user = await auth.currentUser(req.session.userId);
      // The service refuses a missing user with 401 (AC-12); the route only passes it on.
      res.json({ events: await events.listUpcoming(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/events', async (req, res, next) => {
    try {
      const user = await auth.currentUser(req.session.userId);
      const event = await events.create(user, req.body);
      res.status(201).json({ event });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/events/:id/registrations', async (req, res, next) => {
    try {
      const user = await auth.currentUser(req.session.userId);
      res.json({ registrations: await registrations.listForOrganizer(user, req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/events/:id/registrations', async (req, res, next) => {
    try {
      const user = await auth.currentUser(req.session.userId);
      await registrations.register(user, req.params.id);
      res.status(201).json({ message: 'You are signed up' });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/api/events/:id/registrations/:userId', async (req, res, next) => {
    try {
      const user = await auth.currentUser(req.session.userId);
      await registrations.cancel(user, req.params.id, req.params.userId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { eventRoutes };
