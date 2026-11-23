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
  router.get('/organizer/events/new', async (req, res, next) => {
    try {
      const user = await auth.currentUser(req.session.userId);
      if (!user) return res.redirect('/login');
      if (user.role !== 'organizer') {
        return res.status(403).sendFile(path.join(VIEWS, 'forbidden.html'));
      }
      res.sendFile(path.join(VIEWS, 'new-event.html'));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { pageRoutes };
