import { redirect } from 'react-router';
import { createSession, deleteSession, getSessionUser, type User } from './accounts';

const SESSION_COOKIE = 'session';

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** A Set-Cookie header value. Always HttpOnly and SameSite=Lax; Secure over HTTPS. */
export function cookie(
  request: Request,
  name: string,
  value: string,
  options: { path: string; maxAge: number },
): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=${options.path}; HttpOnly; SameSite=Lax; Max-Age=${options.maxAge}${secure}`;
}

/** Only same-site paths, so a crafted `next` can't redirect users off Fountain. */
export function safeNext(next: string | null | undefined, fallback: string): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

export function isAdmin(env: Env, user: User): boolean {
  return user.xUserId !== null && env.ADMIN_X_USER_IDS.split(',').includes(user.xUserId);
}

/** The signed-in user, or null. Credits any allowance that has come due. */
export async function currentUser(request: Request, env: Env): Promise<User | null> {
  const token = readCookie(request, SESSION_COOKIE);
  return token ? getSessionUser(env.DB, token, Date.now()) : null;
}

/** The signed-in user, or a redirect to sign in and come back. */
export async function requireUser(request: Request, env: Env): Promise<User> {
  const user = await currentUser(request, env);
  if (user) return user;
  const url = new URL(request.url);
  throw redirect(`/auth/x?next=${encodeURIComponent(url.pathname + url.search)}`);
}

/** Starts a session and returns the Set-Cookie header for it. */
export async function startSession(request: Request, env: Env, userId: string): Promise<string> {
  const { token, maxAgeSeconds } = await createSession(env.DB, userId, Date.now());
  return cookie(request, SESSION_COOKIE, token, { path: '/', maxAge: maxAgeSeconds });
}

/** Ends the session and returns the Set-Cookie header that clears it. */
export async function endSession(request: Request, env: Env): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await deleteSession(env.DB, token);
  return cookie(request, SESSION_COOKIE, '', { path: '/', maxAge: 0 });
}
