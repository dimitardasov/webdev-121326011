const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthService } = require('../src/services/auth');
const { hashPassword } = require('../src/lib/passwords');

const member = { id: 2, email: 'member@club.test', name: 'Mihail', role: 'member', passwordHash: hashPassword('member-pass') };
const githubOnly = { id: 3, email: 'gh@club.test', name: 'Gita', role: 'member', passwordHash: null };

// A fake data layer: the service never knows there is no database.
const users = {
  async findByEmail(email) {
    return [member, githubOnly].find((u) => u.email === email) ?? null;
  },
  async findById(id) {
    return [member, githubOnly].find((u) => u.id === id) ?? null;
  },
};
const auth = createAuthService({ users });

test('a member signs in with the right password and gets no password hash back', async () => {
  const user = await auth.signIn(' Member@Club.test ', 'member-pass');
  assert.deepEqual(user, { id: 2, email: 'member@club.test', name: 'Mihail', role: 'member' });
});

test('AC-11 a wrong password and an unknown email give the same message', async () => {
  const wrongPassword = await auth.signIn('member@club.test', 'nope').catch((e) => e);
  const unknownEmail = await auth.signIn('nobody@club.test', 'nope').catch((e) => e);
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.equal(wrongPassword.message, 'Wrong email or password');
  assert.equal(unknownEmail.message, wrongPassword.message);
});

test('an account with no password cannot be signed into with a password', async () => {
  await assert.rejects(auth.signIn('gh@club.test', 'anything'), { status: 401 });
});

test('an empty email or password is refused with 400', async () => {
  await assert.rejects(auth.signIn('', 'member-pass'), { status: 400 });
  await assert.rejects(auth.signIn('member@club.test', ''), { status: 400 });
});

test('currentUser is null without a session and for a deleted user', async () => {
  assert.equal(await auth.currentUser(undefined), null);
  assert.equal(await auth.currentUser(999), null);
  assert.equal((await auth.currentUser(2)).email, 'member@club.test');
});

test('AC-9 signInWithProvider links a verified email to the existing account', async () => {
  const calls = [];
  const users = {
    async findIdentity() { return null; },
    async findByEmail(email) {
      assert.equal(email, 'member@club.test');
      return member;
    },
    async createProviderUser() { throw new Error('should not create a duplicate user'); },
    async linkIdentity(provider, providerUserId, userId) {
      calls.push({ provider, providerUserId, userId });
    },
  };
  const providerAuth = createAuthService({ users });

  const user = await providerAuth.signInWithProvider({
    provider: 'github',
    providerUserId: '100',
    email: 'Member@Club.test',
    emailVerified: true,
    name: 'Mihail',
  });

  assert.deepEqual(user, { id: 2, email: 'member@club.test', name: 'Mihail', role: 'member' });
  assert.deepEqual(calls, [{ provider: 'github', providerUserId: '100', userId: 2 }]);
});

test('AC-9 signInWithProvider finds an existing identity before email linking', async () => {
  const users = {
    async findIdentity(provider, providerUserId) {
      assert.equal(provider, 'github');
      assert.equal(providerUserId, '100');
      return githubOnly;
    },
  };
  const providerAuth = createAuthService({ users });
  const user = await providerAuth.signInWithProvider({
    provider: 'github',
    providerUserId: '100',
    email: 'gh@club.test',
    emailVerified: true,
  });
  assert.equal(user.id, githubOnly.id);
});

test('AC-9 signInWithProvider creates a passwordless user and links the identity', async () => {
  const calls = [];
  const created = { id: 4, email: 'new@club.test', name: 'New User', role: 'member', passwordHash: null };
  const users = {
    async findIdentity() { return null; },
    async findByEmail() { return null; },
    async createProviderUser(input) {
      calls.push(['create', input]);
      return created;
    },
    async linkIdentity(provider, providerUserId, userId) {
      calls.push(['link', provider, providerUserId, userId]);
    },
  };
  const providerAuth = createAuthService({ users });
  const user = await providerAuth.signInWithProvider({
    provider: 'github',
    providerUserId: '200',
    email: 'New@Club.test',
    emailVerified: true,
    name: 'New User',
  });
  assert.equal(user.id, 4);
  assert.deepEqual(calls, [
    ['create', { email: 'new@club.test', name: 'New User' }],
    ['link', 'github', '200', 4],
  ]);
});

test('AC-9 an unverified email is not used to link to an existing account', async () => {
  const calls = [];
  const created = { id: 5, email: 'other@club.test', name: 'Other', role: 'member', passwordHash: null };
  const users = {
    async findIdentity() { return null; },
    async findByEmail() { throw new Error('unverified email must not be looked up'); },
    async createProviderUser(input) {
      calls.push(['create', input]);
      return created;
    },
    async linkIdentity(provider, providerUserId, userId) {
      calls.push(['link', provider, providerUserId, userId]);
    },
  };
  const providerAuth = createAuthService({ users });
  await providerAuth.signInWithProvider({
    provider: 'github',
    providerUserId: '300',
    email: 'other@club.test',
    emailVerified: false,
    name: 'Other',
  });
  assert.deepEqual(calls, [
    ['create', { email: 'other@club.test', name: 'Other' }],
    ['link', 'github', '300', 5],
  ]);
});
