function createMcpServices() {
  const { createAuthService } = require('./services/auth');
  const { createEventService } = require('./services/events');
  const { createRegistrationService } = require('./services/registrations');
  const users = require('./data/users');
  const events = require('./data/events');
  const registrations = require('./data/registrations');

  return {
    auth: createAuthService({ users }),
    events: createEventService({ events }),
    registrations: createRegistrationService({ registrations }),
  };
}

module.exports = { createMcpServices };
