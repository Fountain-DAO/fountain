import { Form, redirect } from 'react-router';
import { AccountError, createInvite, listInvites } from '~/.server/accounts';
import { endSession, isAdmin, requireUser } from '~/.server/session';
import { cloudflareContext } from '~/context';
import { Footer } from '~/welcome/footer';
import { Header } from '~/welcome/header';
import type { Route } from './+types/account';

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const user = await requireUser(request, env);
  if (user.joinedAt === null) throw redirect('/join');
  const origin = new URL(request.url).origin;
  return {
    handle: user.handle,
    balance: user.balance.toLocaleString('en'),
    invitesLeft: user.invitesLeft,
    admin: isAdmin(env, user),
    invites: (await listInvites(env.DB, user.id)).map(i => ({
      ...i,
      url: `${origin}/join?code=${i.code}`,
    })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const intent = (await request.formData()).get('intent');
  if (intent === 'sign-out') {
    throw redirect('/', { headers: { 'Set-Cookie': await endSession(request, env) } });
  }
  const user = await requireUser(request, env);
  if (intent === 'invite') {
    try {
      await createInvite(env.DB, user, Date.now(), isAdmin(env, user));
    } catch (e) {
      if (e instanceof AccountError) return { error: e.message };
      throw e;
    }
  }
  return null;
}

export const meta: Route.MetaFunction = () => [{ title: 'Your account · Fountain' }];

export default function Account({ loaderData, actionData }: Route.ComponentProps) {
  const { handle, balance, invitesLeft, admin, invites } = loaderData;
  return (
    <div>
      <Header />
      <main className='page panel'>
        <h1>@{handle}</h1>
        <p className='balance'>
          <strong>{balance}</strong> points
        </p>

        <h2>Invites</h2>
        <p>
          {admin
            ? 'As an admin, you can create as many invites as you need.'
            : `You have ${invitesLeft} invite${invitesLeft === 1 ? '' : 's'} left. Each one lets someone join with points of their own.`}
        </p>
        {invites.length > 0 ? (
          <ul className='invite-list'>
            {invites.map(i => (
              <li key={i.code}>
                <code>{i.url}</code>
                <span>{i.redeemedBy ? `Joined: @${i.redeemedBy}` : 'Not used yet'}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <Form method='post' className='form'>
          {actionData?.error ? <p className='form-error'>{actionData.error}</p> : null}
          <button
            className='button'
            type='submit'
            name='intent'
            value='invite'
            disabled={!admin && invitesLeft === 0}
          >
            Create an invite link
          </button>
        </Form>

        <Form method='post' className='form sign-out'>
          <button className='button-quiet' type='submit' name='intent' value='sign-out'>
            Sign out
          </button>
        </Form>
      </main>
      <Footer />
    </div>
  );
}
