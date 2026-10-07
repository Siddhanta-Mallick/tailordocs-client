const sessionStorageKey = 'tailordocs.cognito.session';
const authorizationStorageKey = 'tailordocs.cognito.authorization';

export class AuthenticationRequiredError extends Error {
  constructor() {
    super('Your session has ended. Sign in again to continue.');
  }
}

function settings() {
  const domain = import.meta.env.VITE_COGNITO_DOMAIN?.replace(/\/$/, '');
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI;
  const logoutUri = import.meta.env.VITE_COGNITO_LOGOUT_URI;

  if (!domain || !clientId || !redirectUri || !logoutUri) {
    throw new Error('Cognito is not configured. Set VITE_COGNITO_DOMAIN, VITE_COGNITO_CLIENT_ID, VITE_COGNITO_REDIRECT_URI, and VITE_COGNITO_LOGOUT_URI.');
  }

  return { domain, clientId, redirectUri, logoutUri };
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function saveSession(tokens, refreshToken) {
  const session = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || refreshToken,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  sessionStorage.setItem(sessionStorageKey, JSON.stringify(session));
  return session;
}

function storedSession() {
  const value = sessionStorage.getItem(sessionStorageKey);
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    clearSession();
    return null;
  }
}

async function requestTokens(parameters) {
  const { domain, clientId } = settings();
  const response = await fetch(`${domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, ...parameters }),
  });
  const tokens = await response.json().catch(() => null);

  if (!response.ok || !tokens?.access_token || !tokens?.expires_in) {
    throw new Error(tokens?.error_description || 'Cognito could not complete sign-in.');
  }

  return tokens;
}

async function exchangeAuthorizationCode(code, verifier) {
  const { redirectUri } = settings();
  return requestTokens({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
}

async function refreshSession(session) {
  if (!session?.refreshToken) throw new AuthenticationRequiredError();

  try {
    return saveSession(await requestTokens({ grant_type: 'refresh_token', refresh_token: session.refreshToken }), session.refreshToken);
  } catch {
    clearSession();
    throw new AuthenticationRequiredError();
  }
}

function clearAuthorizationParameters() {
  const url = new URL(window.location.href);
  ['code', 'state', 'error', 'error_description'].forEach(parameter => url.searchParams.delete(parameter));
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

export function clearSession() {
  sessionStorage.removeItem(sessionStorageKey);
  sessionStorage.removeItem(authorizationStorageKey);
}

export async function initializeSession() {
  const parameters = new URLSearchParams(window.location.search);
  const error = parameters.get('error');
  const code = parameters.get('code');

  if (error) {
    clearAuthorizationParameters();
    throw new Error(parameters.get('error_description') || 'Cognito sign-in was not completed.');
  }

  if (code) {
    const pendingAuthorization = sessionStorage.getItem(authorizationStorageKey);
    sessionStorage.removeItem(authorizationStorageKey);
    clearAuthorizationParameters();

    let authorization = null;
    try {
      authorization = pendingAuthorization && JSON.parse(pendingAuthorization);
    } catch {
      // Treat damaged browser storage as an unverified authorization response.
    }

    if (!authorization || parameters.get('state') !== authorization.state) {
      throw new Error('Cognito sign-in could not be verified. Please try again.');
    }

    return saveSession(await exchangeAuthorizationCode(code, authorization.verifier));
  }

  const session = storedSession();
  if (!session) return null;
  return session.expiresAt > Date.now() + 30_000 ? session : refreshSession(session);
}

export async function accessToken() {
  const session = storedSession();
  if (!session) throw new AuthenticationRequiredError();
  const currentSession = session.expiresAt > Date.now() + 30_000 ? session : await refreshSession(session);
  return currentSession.accessToken;
}

export async function signIn() {
  const { domain, clientId, redirectUri } = settings();
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem(authorizationStorageKey, JSON.stringify({ state, verifier }));

  const url = new URL(`${domain}/oauth2/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: base64Url(new Uint8Array(digest)),
    state,
  }).toString();
  window.location.assign(url);
}

export function signOut() {
  const { domain, clientId, logoutUri } = settings();
  clearSession();
  const url = new URL(`${domain}/logout`);
  url.search = new URLSearchParams({ client_id: clientId, logout_uri: logoutUri }).toString();
  window.location.assign(url);
}
