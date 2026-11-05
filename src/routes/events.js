const express = require('express');

function eventRoutes({ auth, events }) {
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

  return router;
}

module.exports = { eventRoutes };
