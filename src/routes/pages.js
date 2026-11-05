const path = require('node:path');
const express = require('express');

const VIEWS = path.join(__dirname, '..', '..', 'views');

function pageRoutes({ auth }) {
  const router = express.Router();

  // Pages that need a signed-in user send a visitor to /login instead (AC-12, AC-15).
  const signedIn = async (req, res, next) => {
    try {
      if (await auth.currentUser(req.session.userId)) return next();
      res.redirect('/login');
    } catch (error) {
      next(error);
    }
  };

  router.get('/', (req, res) => res.redirect('/events'));
  router.get('/login', (req, res) => res.sendFile(path.join(VIEWS, 'login.html')));
  router.get('/events', signedIn, (req, res) => res.sendFile(path.join(VIEWS, 'events.html')));

  return router;
}

module.exports = { pageRoutes };
