import { redirect } from 'react-router';
import { cookie, safeNext } from '~/.server/session';
import { getRequestToken } from '~/.server/x-oauth';
import { cloudflareContext } from '~/context';
import type { Route } from './+types/auth-x';

const REQUEST_COOKIE = 'x_oauth_request';

/** Starts Sign in with X: gets a request token and sends the user to X to approve it. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'), '');
  const token = await getRequestToken(
    { key: env.X_CONSUMER_KEY, secret: env.X_CONSUMER_SECRET },
    new URL('/auth/x/callback', request.url).toString(),
  );
  // The request token's secret is needed once, in the callback, along with where to return to.
  // It's short-lived and useless without the user's approval, so an HttpOnly cookie will do.
  const value = JSON.stringify({ token: token.token, secret: token.secret, next });
  return redirect(token.authenticateUrl, {
    headers: {
      'Set-Cookie': cookie(request, REQUEST_COOKIE, value, { path: '/auth/x', maxAge: 600 }),
    },
  });
}
