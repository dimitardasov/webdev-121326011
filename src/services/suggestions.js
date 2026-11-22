const { ServiceError } = require('./errors');
const { ModelUnavailableError } = require('../model/gemini');

const FALLBACK_MESSAGE = 'Suggestions are unavailable, fill in the form yourself';

function fallback() {
  return {
    title: '',
    startsAt: '',
    capacity: '',
    description: '',
    message: FALLBACK_MESSAGE,
  };
}

function createSuggestionService({ client, clock = () => new Date() }) {
  return {
    async suggestEvent(user, text) {
      if (!user) throw new ServiceError(401, 'Sign in to get event suggestions.');
      if (user.role !== 'organizer') {
        throw new ServiceError(403, 'Only organizers can get event suggestions.');
      }

      const now = clock();
      let suggestion;
      try {
        suggestion = await client.suggestEvent(text, now);
      } catch (error) {
        if (error instanceof ModelUnavailableError) return fallback();
        throw error;
      }

      const startsAt = typeof suggestion?.startsAt === 'string'
        && Number.isFinite(Date.parse(suggestion.startsAt))
        && Date.parse(suggestion.startsAt) > now.getTime()
        ? suggestion.startsAt
        : '';
      const capacity = Number.isInteger(suggestion?.capacity)
        && suggestion.capacity >= 1
        && suggestion.capacity <= 500
        ? suggestion.capacity
        : '';

      return {
        title: typeof suggestion?.title === 'string' && suggestion.title.length <= 120
          ? suggestion.title
          : '',
        startsAt,
        capacity,
        description: typeof suggestion?.description === 'string' ? suggestion.description : '',
        message: '',
      };
    },
  };
}

module.exports = { createSuggestionService, FALLBACK_MESSAGE };
