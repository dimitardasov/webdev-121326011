const { verifyPassword } = require('../lib/passwords');
const { ServiceError } = require('./errors');

// What the rest of the app may know about a user: never the password hash.
function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

function createAuthService({ users }) {
  return {
    async signIn(email, password) {
      if (!email || !password) throw new ServiceError(400, 'Enter your email and password.');
      const user = await users.findByEmail(String(email).trim().toLowerCase());
      // AC-11: the same message whether the email is unknown or the password is wrong.
      if (!user || !verifyPassword(String(password), user.passwordHash)) {
        throw new ServiceError(401, 'Wrong email or password');
      }
      return publicUser(user);
    },

    async currentUser(userId) {
      if (!userId) return null;
      const user = await users.findById(userId);
      return user ? publicUser(user) : null;
    },

    async signInWithProvider(profile) {
      const provider = String(profile?.provider || '');
      const providerUserId = String(profile?.providerUserId || '');
      if (!provider || !providerUserId) {
        throw new ServiceError(400, 'Provider identity is missing.');
      }

      const existingIdentity = await users.findIdentity(provider, providerUserId);
      if (existingIdentity) return publicUser(existingIdentity);

      const email = typeof profile.email === 'string'
        ? profile.email.trim().toLowerCase()
        : '';
      let user = null;

      if (profile.emailVerified && email) {
        user = await users.findByEmail(email);
      }
      if (!user) {
        if (!email) {
          throw new ServiceError(400, 'A verified email is required.');
        }
        user = await users.createProviderUser({
          email,
          name: typeof profile.name === 'string' && profile.name.trim()
            ? profile.name.trim()
            : email,
        });
      }

      await users.linkIdentity(provider, providerUserId, user.id);
      return publicUser(user);
    },
  };
}

module.exports = { createAuthService };
