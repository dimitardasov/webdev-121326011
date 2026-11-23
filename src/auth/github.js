const { createHash } = require('node:crypto');

class GitHubAuthError extends Error {
  constructor(operation, message) {
    super(`GitHub ${operation} failed: ${message}`);
    this.name = 'GitHubAuthError';
    this.operation = operation;
  }
}

function createGitHubAuth(fetchImpl = globalThis.fetch, env = process.env) {
  function configuration() {
    const clientId = env.GITHUB_CLIENT_ID?.trim();
    const clientSecret = env.GITHUB_CLIENT_SECRET?.trim();
    const publicBaseUrl = env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
    if (!clientId || !clientSecret || !publicBaseUrl) return null;
    return { clientId, clientSecret, publicBaseUrl };
  }

  function makeError(operation, message) {
    return new GitHubAuthError(operation, message);
  }

  function safeMessage(error, secrets) {
    let message = error instanceof Error ? error.message : String(error);
    for (const secret of secrets) {
      if (secret) message = message.split(secret).join('[redacted]');
    }
    return message.slice(0, 300);
  }

  async function requestJson(url, options, operation, secrets = []) {
    let response;
    try {
      response = await fetchImpl(url, options);
    } catch (error) {
      throw makeError(operation, `network request failed: ${safeMessage(error, secrets)}`);
    }
    if (!response.ok) {
      throw makeError(operation, `HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw makeError(operation, 'invalid JSON response');
    }
  }

  return {
    isConfigured() {
      return configuration() !== null;
    },

    authorizationUrl(state, codeChallenge) {
      const config = configuration();
      if (!config) throw makeError('configuration', 'is incomplete');
      const url = new URL('https://github.com/login/oauth/authorize');
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: `${config.publicBaseUrl}/api/auth/github/callback`,
        scope: 'read:user user:email',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      return url.toString();
    },

    async getProfile(code, codeVerifier) {
      const config = configuration();
      if (!config) throw makeError('configuration', 'is incomplete');
      if (!code || !codeVerifier) throw makeError('callback', 'authorization code is missing');

      const redirectUri = `${config.publicBaseUrl}/api/auth/github/callback`;
      const tokenData = await requestJson(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code: String(code),
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
        },
        'token exchange',
        [config.clientSecret],
      );
      if (typeof tokenData.access_token !== 'string' || !tokenData.access_token) {
        throw makeError('token exchange', 'access token is missing');
      }

      const accessToken = tokenData.access_token;
      const headers = {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      };
      const user = await requestJson(
        'https://api.github.com/user',
        { headers },
        'user lookup',
        [config.clientSecret, accessToken],
      );
      const emails = await requestJson(
        'https://api.github.com/user/emails',
        { headers },
        'email lookup',
        [config.clientSecret, accessToken],
      );
      const primaryEmail = Array.isArray(emails)
        ? emails.find((email) => email?.primary === true && email?.verified === true)
        : null;

      if (!primaryEmail || typeof primaryEmail.email !== 'string' || !primaryEmail.email.trim()) {
        throw makeError('email lookup', 'no verified primary email is available');
      }
      if (user.id === undefined || user.id === null) {
        throw makeError('user lookup', 'user id is missing');
      }

      return {
        providerUserId: String(user.id),
        email: primaryEmail.email,
        emailVerified: true,
        name: typeof user.name === 'string' && user.name.trim()
          ? user.name
          : user.login,
      };
    },
  };
}

function codeChallenge(codeVerifier) {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

module.exports = { createGitHubAuth, codeChallenge };
