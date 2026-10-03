import type { Route } from './+types/privacy';
import { GITHUB_URL, X_HANDLE, X_URL } from '~/welcome/env';
import { LegalPage } from '~/welcome/legal-page';

export const meta: Route.MetaFunction = () => [
  { title: 'Privacy Policy · Fountain' },
  { name: 'description', content: 'What information fountain.markets collects, and why.' },
];

export default function PrivacyPolicy() {
  return (
    <LegalPage title='Privacy Policy' updated='3 October 2026'>
      <p>
        This policy explains what information is collected when you visit fountain.markets (the
        "site"), and what happens to it. The short version: we don't ask for any personal
        information, we don't set cookies, and we don't use analytics or advertising trackers.
      </p>

      <h2>Where Fountain is today</h2>
      <p>
        Fountain is in early development, and the site is an information page. There are no
        accounts, forms or sign-ups. When the market opens, it will need more information, such as
        what you need to sign in, and your claims, stakes and evidence, which are public by design.
        We'll update this policy to explain that before any of it is collected.
      </p>

      <h2>What is collected</h2>
      <p>
        Like any website, the site can't be delivered without some technical information passing
        through the services that host it:
      </p>
      <ul>
        <li>
          <strong>Hosting.</strong> The site runs on Cloudflare. To serve and protect it, Cloudflare
          processes request information such as your IP address, browser and device type, and the
          pages you request. Cloudflare may keep this briefly in logs, and uses it under its own{' '}
          <a href='https://www.cloudflare.com/privacypolicy/'>privacy policy</a>.
        </li>
        <li>
          <strong>Fonts.</strong> The site loads its typeface from Google Fonts. Your browser
          requests the font files from Google, which receives your IP address and browser details.
          Google's <a href='https://policies.google.com/privacy'>privacy policy</a> applies.
        </li>
      </ul>
      <p>
        We don't use this information to identify you, build a profile of you, or sell or share it
        for advertising.
      </p>

      <h2>Cookies and tracking</h2>
      <p>
        The site doesn't set cookies or use local storage, and it has no analytics, advertising or
        social media tracking scripts. Links to X and GitHub are ordinary links, so nothing is sent
        to those services unless you click through.
      </p>

      <h2>Other sites</h2>
      <p>
        Fountain is discussed on X, and its code is on GitHub. If you follow, post or contribute
        there, those services' own privacy policies apply. Anything you post publicly there, such as
        an issue on GitHub, is visible to everyone.
      </p>

      <h2>Your rights</h2>
      <p>
        We don't hold personal information about visitors to the site, so there is usually nothing
        for us to access, correct or delete. If you think we hold information about you, or you have
        a concern about how it's been handled, contact us and we'll respond within 30 days. If
        you're not satisfied with our response, you can complain to the Office of the Australian
        Information Commissioner at <a href='https://www.oaic.gov.au'>oaic.gov.au</a>, or the data
        protection authority where you live.
      </p>

      <h2>Children</h2>
      <p>
        The site isn't directed at children under 13, and we don't knowingly collect their
        information.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We'll update this policy when what the site collects changes, and change the date at the top
        of this page. The history of every change is public on GitHub.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy can go to <a href={X_URL}>@{X_HANDLE} on X</a> or an issue on{' '}
        <a href={GITHUB_URL}>GitHub</a>. Please don't include personal information in a public
        GitHub issue.
      </p>
    </LegalPage>
  );
}
