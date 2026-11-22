const { ServiceError } = require('./errors');

// `clock` is passed in so a test can fix "now" instead of depending on today's date.
function createEventService({ events, clock = () => new Date() }) {
  return {
    async listUpcoming(user) {
      if (!user) throw new ServiceError(401, 'Sign in to see events.');
      const rows = await events.listStartingAfter(clock(), user.id);
      return rows.map((event) => ({
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
        capacity: event.capacity,
        freePlaces: Math.max(0, event.capacity - event.registered),
        isRegistered: Boolean(event.isRegistered),
      }));
    },
  };
}

module.exports = { createEventService };
