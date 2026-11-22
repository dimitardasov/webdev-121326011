const { ServiceError } = require('./errors');

function createRegistrationService({ registrations, clock = () => new Date() }) {
  return {
    async register(user, eventId) {
      if (!user) throw new ServiceError(401, 'Sign in to sign up for events.');

      return registrations.withEventTransaction(eventId, async (transaction) => {
        const { event } = transaction;
        if (!event) throw new ServiceError(404, 'Event not found.');
        if (new Date(event.startsAt) <= clock()) {
          throw new ServiceError(409, 'This event has already started');
        }
        if (await transaction.hasRegistration(user.id)) {
          throw new ServiceError(409, 'You are already signed up');
        }
        if ((await transaction.countRegistrations()) >= event.capacity) {
          throw new ServiceError(409, 'This event is full');
        }

        const registration = await transaction.insertRegistration(user.id);
        return { userId: user.id, eventId, createdAt: registration.createdAt };
      });
    },

    async cancel(user, eventId, userId) {
      if (!user) throw new ServiceError(401, 'Sign in to cancel a registration.');

      return registrations.withEventTransaction(eventId, async (transaction) => {
        if (!transaction.event) throw new ServiceError(404, 'Event not found.');
        if (String(user.id) !== String(userId)) {
          throw new ServiceError(403, 'You can only cancel your own registration.');
        }
        if (!(await transaction.deleteRegistration(user.id))) {
          throw new ServiceError(404, 'Registration not found.');
        }
      });
    },
  };
}

module.exports = { createRegistrationService };
