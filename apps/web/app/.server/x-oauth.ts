// Sign in with X using OAuth 1.0a. Unlike OAuth 2.0, the final step of this flow returns the
// user's id and handle directly, so no API call (and no API billing) is needed to identify them.
// https://docs.x.com/resources/fundamentals/authentication/oauth-1-0a/obtaining-user-access-tokens

const X_API = 'https://api.x.com';

export interface Consumer {
  readonly key: string;
  readonly secret: string;
}

/** RFC 3986 percent-encoding, as OAuth 1.0a requires (stricter than encodeURIComponent). */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** The HMAC-SHA1 signature over the method, URL and every parameter (oauth_* and request). */
export async function sign(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret = '',
): Promise<string> {
  const normalized = Object.entries(params)
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .toSorted(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : 1) : ak < bk ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const base = [method.toUpperCase(), percentEncode(url), percentEncode(normalized)].join('&');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(base));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function nonce(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

/** Makes a signed POST to an OAuth endpoint and parses its form-encoded response. */
async function oauthPost(
  consumer: Consumer,
  path: string,
  oauth: Record<string, string>,
  tokenSecret?: string,
): Promise<URLSearchParams> {
  const url = `${X_API}${path}`;
  const params: Record<string, string> = {
    oauth_consumer_key: consumer.key,
    oauth_nonce: nonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    ...oauth,
  };
  params.oauth_signature = await sign('POST', url, params, consumer.secret, tokenSecret);
  const header = Object.entries(params)
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(', ');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `OAuth ${header}` },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`X ${path} failed with ${response.status}: ${body}`);
  return new URLSearchParams(body);
}

export interface RequestToken {
  readonly token: string;
  readonly secret: string;
  /** Where to send the user to approve the sign-in. */
  readonly authenticateUrl: string;
}

/** Step 1: get a temporary request token for this sign-in. */
export async function getRequestToken(
  consumer: Consumer,
  callbackUrl: string,
): Promise<RequestToken> {
  const result = await oauthPost(consumer, '/oauth/request_token', { oauth_callback: callbackUrl });
  const token = result.get('oauth_token');
  const secret = result.get('oauth_token_secret');
  if (!token || !secret || result.get('oauth_callback_confirmed') !== 'true') {
    throw new Error('X returned an incomplete request token');
  }
  return {
    token,
    secret,
    authenticateUrl: `${X_API}/oauth/authenticate?oauth_token=${percentEncode(token)}`,
  };
}

export interface XIdentity {
  /** Stable numeric id. Handles can change; this can't. */
  readonly userId: string;
  readonly handle: string;
}

/** Step 3: exchange the approved request token for the user's identity. */
export async function getIdentity(
  consumer: Consumer,
  requestToken: string,
  requestSecret: string,
  verifier: string,
): Promise<XIdentity> {
  const result = await oauthPost(
    consumer,
    '/oauth/access_token',
    { oauth_token: requestToken, oauth_verifier: verifier },
    requestSecret,
  );
  const userId = result.get('user_id');
  const handle = result.get('screen_name');
  if (!userId || !handle) throw new Error('X did not return the user id and handle');
  // The access token itself is discarded: we only needed to know who signed in.
  return { userId, handle };
}
