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

    async create(user, input) {
      if (!user) throw new ServiceError(401, 'Sign in to create events.');
      if (user.role !== 'organizer') {
        throw new ServiceError(403, 'Only organizers can create events.');
      }

      const title = typeof input?.title === 'string' ? input.title.trim() : '';
      const startsAt = new Date(input?.startsAt);
      const capacity = Number(input?.capacity);

      if (!title || title.length > 120
        || Number.isNaN(startsAt.getTime())
        || startsAt <= clock()
        || !Number.isInteger(capacity)
        || capacity < 1
        || capacity > 500) {
        throw new ServiceError(400, 'Invalid event details.');
      }

      return events.createEvent({
        title,
        startsAt,
        capacity,
        createdBy: user.id,
      });
    },
  };
}

module.exports = { createEventService };
