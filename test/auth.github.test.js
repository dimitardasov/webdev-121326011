const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createServer } = require('node:http');
const { createApp } = require('../src/app');
const { createGitHubAuth } = require('../src/auth/github');

const config = {
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  PUBLIC_BASE_URL: 'https://club.test/',
};
const token = 'private-test-access-token';

function createGitHubFetch(email = {
  email: 'member@club.test',
  primary: true,
  verified: true,
}) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (url === 'https://github.com/login/oauth/access_token') {
      return Response.json({ access_token: token, token_type: 'bearer' });
    }
    if (url === 'https://api.github.com/user') {
      return Response.json({ id: 123, name: 'GitHub Member', login: 'gh-member' });
    }
    if (url === 'https://api.github.com/user/emails') {
      return Response.json([email]);
    }
    throw new Error(`Unexpected GitHub URL: ${url}`);
  };
  return { fetchImpl, requests };
}

async function createHarness(t, { auth, fetchImpl, env = config }) {
  const github = createGitHubAuth(fetchImpl, env);
  const app = createApp({
    auth,
    github,
    events: {},
    registrations: {},
    suggestions: {},
    health: { async checkDatabase() {} },
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${port}`;
}

async function beginSignIn(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/github`, { redirect: 'manual' });
  const location = new URL(response.headers.get('location'));
  const cookie = response.headers.get('set-cookie').split(';', 1)[0];
  return { response, location, cookie };
}

test('Exercise 4 step 8 missing or wrong state returns 400 and never signs in', async (t) => {
  const { fetchImpl } = createGitHubFetch();
  let signInCalls = 0;
  const auth = {
    async signInWithProvider() {
      signInCalls += 1;
      return { id: 2, email: 'member@club.test', name: 'Member', role: 'member' };
    },
    async currentUser() { return null; },
  };
  const baseUrl = await createHarness(t, { auth, fetchImpl });

  for (const stateType of ['missing', 'wrong']) {
    const { location, cookie } = await beginSignIn(baseUrl);
    const state = location.searchParams.get('state');
    const callbackUrl = new URL('/api/auth/github/callback', baseUrl);
    callbackUrl.searchParams.set('code', 'code');
    if (stateType === 'wrong') callbackUrl.searchParams.set('state', 'wrong');
    const callback = await fetch(callbackUrl, { headers: { cookie }, redirect: 'manual' });
    assert.equal(callback.status, 400);

    const retry = await fetch(
      `${baseUrl}/api/auth/github/callback?code=code&state=${state}`,
      { headers: { cookie }, redirect: 'manual' },
    );
    assert.equal(retry.status, 400);

    const me = await fetch(`${baseUrl}/api/me`, { headers: { cookie } });
    assert.equal(me.status, 401);
  }
  assert.equal(signInCalls, 0);
});

test('AC-9 Exercise 4 step 8 verified GitHub email signs in and keeps the token private', async (t) => {
  const { fetchImpl, requests } = createGitHubFetch();
  const user = { id: 9, email: 'member@club.test', name: 'Member', role: 'member' };
  let signedInProfile;
  const auth = {
    async signInWithProvider(profile) {
      signedInProfile = profile;
      return user;
    },
    async currentUser(userId) {
      return String(userId) === String(user.id) ? user : null;
    },
  };
  const baseUrl = await createHarness(t, { auth, fetchImpl });
  const { response: start, location, cookie } = await beginSignIn(baseUrl);

  assert.equal(start.status, 302);
  assert.equal(location.origin, 'https://github.com');
  assert.equal(location.pathname, '/login/oauth/authorize');
  assert.equal(location.searchParams.get('client_id'), config.GITHUB_CLIENT_ID);
  assert.equal(location.searchParams.get('redirect_uri'), 'https://club.test/api/auth/github/callback');
  assert.equal(location.searchParams.get('scope'), 'read:user user:email');
  assert.match(location.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');

  const callback = await fetch(
    `${baseUrl}/api/auth/github/callback?code=auth-code&state=${location.searchParams.get('state')}`,
    { headers: { cookie }, redirect: 'manual' },
  );
  const callbackBody = await callback.text();
  const nextCookie = callback.headers.get('set-cookie').split(';', 1)[0];

  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), '/events');
  assert.doesNotMatch(callbackBody, new RegExp(token));
  assert.doesNotMatch(callback.headers.get('set-cookie'), new RegExp(token));
  assert.deepEqual(signedInProfile, {
    provider: 'github',
    providerUserId: '123',
    email: 'member@club.test',
    emailVerified: true,
    name: 'GitHub Member',
  });
  assert.equal(requests.length, 3);
  assert.equal(new URLSearchParams(requests[0].options.body).get('client_secret'), config.GITHUB_CLIENT_SECRET);
  const verifier = new URLSearchParams(requests[0].options.body).get('code_verifier');
  assert.equal(verifier.length, 43);
  assert.equal(
    location.searchParams.get('code_challenge'),
    createHash('sha256').update(verifier).digest('base64url'),
  );
  assert.equal(requests[1].options.headers.authorization, `Bearer ${token}`);

  const me = await fetch(`${baseUrl}/api/me`, { headers: { cookie: nextCookie } });
  assert.equal(me.status, 200);
  assert.deepEqual((await me.json()).user, user);
});

test('Exercise 4 step 8 unverified primary email is not linked', async (t) => {
  const { fetchImpl } = createGitHubFetch({
    email: 'member@club.test',
    primary: true,
    verified: false,
  });
  let signInCalls = 0;
  const auth = {
    async signInWithProvider() {
      signInCalls += 1;
      throw new Error('an unverified address must not be linked');
    },
    async currentUser() { return null; },
  };
  const baseUrl = await createHarness(t, { auth, fetchImpl });
  const { location, cookie } = await beginSignIn(baseUrl);
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args));

  const callback = await fetch(
    `${baseUrl}/api/auth/github/callback?code=auth-code&state=${location.searchParams.get('state')}`,
    { headers: { cookie }, redirect: 'manual' },
  );

  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), '/login?error=github');
  assert.equal(signInCalls, 0);
  assert.equal(logged.length, 1);
  assert.match(logged[0][1].message, /no verified primary email/);
  assert.doesNotMatch(JSON.stringify(logged), new RegExp(token));
  const me = await fetch(`${baseUrl}/api/me`, { headers: { cookie } });
  assert.equal(me.status, 401);
});

test('Exercise 4 step 8 incomplete GitHub configuration returns 503', async (t) => {
  let fetchCalls = 0;
  const baseUrl = await createHarness(t, {
    auth: {},
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('GitHub must not be called');
    },
    env: { ...config, GITHUB_CLIENT_SECRET: '' },
  });

  const response = await fetch(`${baseUrl}/api/auth/github`);

  assert.equal(response.status, 503);
  assert.equal(await response.text(), 'GitHub sign-in is not configured');
  assert.equal(fetchCalls, 0);
});
