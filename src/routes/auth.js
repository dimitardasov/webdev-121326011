const crypto = require('node:crypto');
const express = require('express');
const { codeChallenge } = require('../auth/github');

function authRoutes({ auth, github }) {
  const router = express.Router();

  router.get('/api/auth/github', (req, res, next) => {
    if (!github.isConfigured()) {
      return res.status(503).send('GitHub sign-in is not configured');
    }

    const state = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    req.session.githubState = state;
    req.session.githubCodeVerifier = codeVerifier;
    try {
      res.redirect(github.authorizationUrl(state, codeChallenge(codeVerifier)));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/auth/github/callback', async (req, res, next) => {
    const savedState = req.session.githubState;
    const codeVerifier = req.session.githubCodeVerifier;
    const returnedState = req.query.state;
    delete req.session.githubState;
    delete req.session.githubCodeVerifier;

    const stateMatches = typeof returnedState === 'string'
      && typeof savedState === 'string'
      && Buffer.byteLength(returnedState) === Buffer.byteLength(savedState)
      && crypto.timingSafeEqual(Buffer.from(returnedState), Buffer.from(savedState));
    if (!stateMatches) return res.status(400).send('Invalid OAuth state.');

    try {
      const profile = await github.getProfile(req.query.code, codeVerifier);
      const user = await auth.signInWithProvider({
        provider: 'github',
        ...profile,
      });
      req.session.regenerate((error) => {
        if (error) return next(error);
        req.session.userId = user.id;
        res.redirect('/events');
      });
    } catch (error) {
      console.error('GitHub sign-in failed:', error);
      res.redirect('/login?error=github');
    }
  });

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
