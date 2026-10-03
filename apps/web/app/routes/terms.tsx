import type { Route } from './+types/terms';
import { GITHUB_URL, X_HANDLE, X_URL } from '~/welcome/env';
import { LegalPage } from '~/welcome/legal-page';

export const meta: Route.MetaFunction = () => [
  { title: 'Terms of Service · Fountain' },
  { name: 'description', content: 'The terms that apply when you use fountain.markets.' },
];

export default function Terms() {
  return (
    <LegalPage title='Terms of Service' updated='3 October 2026'>
      <p>
        These terms apply when you use fountain.markets (the "site"). By using the site, you agree
        to them. If you don't agree, please don't use the site.
      </p>

      <h2>Where Fountain is today</h2>
      <p>
        Fountain is in early development. Right now the site is an information page about the
        project. There are no accounts, and the market itself is not open. Before accounts, claims
        or staking are available, we'll update these terms to cover them, and you'll be asked to
        accept the updated terms when you sign up.
      </p>

      <h2>Points are not money</h2>
      <p>
        Fountain runs on points. Points have no monetary value. They can't be bought, sold,
        transferred, or exchanged for money, tokens or anything else, and there is no plan to make
        them convertible. There is no Fountain token. Anyone offering to sell you points or a
        Fountain token is not acting for us.
      </p>

      <h2>Not advice, and not a verdict</h2>
      <p>
        Content on the site, including descriptions of how claims settle, is general information. It
        isn't scientific, financial, legal or other professional advice. When the market opens, a
        settled claim will reflect a consensus among the people who staked on it, not a ruling by
        Fountain that the claim is true or false.
      </p>

      <h2>Acceptable use</h2>
      <p>Don't use the site to:</p>
      <ul>
        <li>break the law, or help someone else break it</li>
        <li>interfere with the site, its hosting or other people's use of it</li>
        <li>probe, scan or attack the site without our permission</li>
        <li>impersonate Fountain or suggest you speak for it when you don't</li>
      </ul>
      <p>
        If you've found a security problem, please tell us privately (see{' '}
        <a href='#contact'>Contact</a>) rather than publishing it first.
      </p>

      <h2>Open source</h2>
      <p>
        Fountain's source code is published on <a href={GITHUB_URL}>GitHub</a> under the GNU Affero
        General Public License v3.0. Your use of the code is governed by that licence, not by these
        terms. These terms cover your use of the site we run at fountain.markets. The Fountain name
        and logo aren't licensed under the AGPL, so if you run your own copy, please give it a
        different name.
      </p>

      <h2>Links to other sites</h2>
      <p>
        The site links to services we don't run, such as X and GitHub. Their own terms and privacy
        policies apply when you use them, and we're not responsible for their content.
      </p>

      <h2>No warranty</h2>
      <p>
        The site is provided as it is and as available. We may change it, pause it or take it down
        at any time. To the extent the law allows, we make no promises that it will be accurate,
        complete, available or free of errors.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent the law allows, we're not liable for any loss or damage arising from your use
        of the site. Nothing in these terms excludes rights you have under the Australian Consumer
        Law or other laws that can't be excluded.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms. When we do, we'll change the date at the top of this page, and
        the history of every change is public on GitHub. If you keep using the site after a change,
        the updated terms apply.
      </p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of Australia.</p>

      <h2 id='contact'>Contact</h2>
      <p>
        Questions about these terms can go to <a href={X_URL}>@{X_HANDLE} on X</a> or an issue on{' '}
        <a href={GITHUB_URL}>GitHub</a>.
      </p>
    </LegalPage>
  );
}
