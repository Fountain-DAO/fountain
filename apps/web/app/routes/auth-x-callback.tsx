import { data, Link, redirect } from 'react-router';
import { joinAsAdmin, upsertXUser } from '~/.server/accounts';
import { cookie, isAdmin, readCookie, safeNext, startSession } from '~/.server/session';
import { getIdentity } from '~/.server/x-oauth';
import { cloudflareContext } from '~/context';
import { Footer } from '~/welcome/footer';
import { Header } from '~/welcome/header';
import type { Route } from './+types/auth-x-callback';

const REQUEST_COOKIE = 'x_oauth_request';

/** Finishes Sign in with X: finds or creates the account, starts a session and sends them on. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const url = new URL(request.url);
  const clear = cookie(request, REQUEST_COOKIE, '', { path: '/auth/x', maxAge: 0 });

  if (url.searchParams.has('denied')) {
    return data({ error: 'You cancelled the sign-in.' }, { headers: { 'Set-Cookie': clear } });
  }
  let saved: { token?: string; secret?: string; next?: string } = {};
  try {
    saved = JSON.parse(readCookie(request, REQUEST_COOKIE) ?? '{}');
  } catch {
    // A malformed cookie is treated like a missing one.
  }
  const token = url.searchParams.get('oauth_token');
  const verifier = url.searchParams.get('oauth_verifier');
  if (!token || !verifier || !saved.secret || token !== saved.token) {
    return data(
      { error: 'This sign-in link is invalid or expired. Please try again.' },
      { headers: { 'Set-Cookie': clear } },
    );
  }

  const identity = await getIdentity(
    { key: env.X_CONSUMER_KEY, secret: env.X_CONSUMER_SECRET },
    token,
    saved.secret,
    verifier,
  );
  const now = Date.now();
  const user = await upsertXUser(env.DB, identity, now);
  const admin = isAdmin(env, user);
  if (user.joinedAt === null && admin) await joinAsAdmin(env.DB, user.id, now);

  const headers = new Headers();
  headers.append('Set-Cookie', clear);
  headers.append('Set-Cookie', await startSession(request, env, user.id));
  const fallback = user.joinedAt === null && !admin ? '/join' : '/account';
  return redirect(safeNext(saved.next, fallback), { headers });
}

export const meta: Route.MetaFunction = () => [{ title: 'Sign in with X · Fountain' }];

export default function XCallback({ loaderData }: Route.ComponentProps) {
  return (
    <div>
      <Header />
      <main className='page panel'>
        <h1>Sign in with X</h1>
        <p>{loaderData.error}</p>
        <p>
          <Link className='button' to='/auth/x'>
            Try again
          </Link>
        </p>
      </main>
      <Footer />
    </div>
  );
}
