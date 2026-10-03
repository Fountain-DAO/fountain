import { data, Form, Link, redirect } from 'react-router';
import { AccountError, POINTS, redeemInvite } from '~/.server/accounts';
import { currentUser, requireUser } from '~/.server/session';
import { cloudflareContext } from '~/context';
import { Footer } from '~/welcome/footer';
import { Header } from '~/welcome/header';
import type { Route } from './+types/join';

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const user = await currentUser(request, env);
  if (user?.joinedAt) throw redirect('/account');
  const url = new URL(request.url);
  return {
    handle: user?.handle ?? null,
    code: url.searchParams.get('code') ?? '',
    signInUrl: `/auth/x?next=${encodeURIComponent(url.pathname + url.search)}`,
    grant: POINTS.joinGrant.toLocaleString('en'),
    allowance: POINTS.weeklyAllowance.toLocaleString('en'),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const user = await requireUser(request, env);
  const code = String((await request.formData()).get('code') ?? '');
  try {
    await redeemInvite(env.DB, user.id, code, Date.now());
  } catch (e) {
    if (e instanceof AccountError) return data({ error: e.message }, { status: 400 });
    throw e;
  }
  throw redirect('/account');
}

export const meta: Route.MetaFunction = () => [{ title: 'Join · Fountain' }];

export default function Join({ loaderData, actionData }: Route.ComponentProps) {
  const { handle, code, signInUrl, grant, allowance } = loaderData;
  return (
    <div>
      <Header />
      <main className='page panel'>
        <h1>Join Fountain</h1>
        <p>
          Fountain is invite-only while it starts. An invite gives you {grant} points to stake on
          claims, plus {allowance} more each week.
        </p>
        {handle === null ? (
          <p>
            <Link className='button' to={signInUrl}>
              Sign in with X to continue
            </Link>
          </p>
        ) : (
          <Form method='post' className='form'>
            <p>
              Signed in as <strong>@{handle}</strong>.
            </p>
            <label>
              Invite code
              <input name='code' defaultValue={code} required autoComplete='off' />
            </label>
            {actionData?.error ? <p className='form-error'>{actionData.error}</p> : null}
            <button className='button' type='submit'>
              Join
            </button>
          </Form>
        )}
      </main>
      <Footer />
    </div>
  );
}
