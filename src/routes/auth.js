const express = require('express');

function authRoutes({ auth }) {
  const router = express.Router();

  router.post('/api/login', async (req, res, next) => {
    try {
      const user = await auth.signIn(req.body?.email, req.body?.password);
      // A new session id on every sign-in, so an id planted before sign-in is useless after it.
      req.session.regenerate((error) => {
        if (error) return next(error);
        req.session.userId = user.id;
        res.json({ user });
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/api/logout', (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('sid');
      res.status(204).end();
    });
  });

  router.get('/api/me', async (req, res, next) => {
    try {
      const user = await auth.currentUser(req.session.userId);
      if (!user) return res.status(401).json({ error: 'Not signed in.' });
      res.json({ user });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { authRoutes };
