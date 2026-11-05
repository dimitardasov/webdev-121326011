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
