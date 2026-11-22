const express = require('express');

function suggestionRoutes({ auth, suggestions }) {
  const router = express.Router();

  router.post('/api/events/suggest', async (req, res, next) => {
    try {
      const user = await auth.currentUser(req.session.userId);
      res.json(await suggestions.suggestEvent(user, req.body?.text));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { suggestionRoutes };
