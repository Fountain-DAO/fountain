import { Footer } from '~/welcome/footer';
import { Header } from '~/welcome/header';
import type { Route } from './+types/privacy';

export const meta: Route.MetaFunction = () => [{ title: 'Privacy Policy' }];

export default function PrivacyPolicy() {
  return (
    <div>
      <Header />
      Nothing here yet
      <Footer />
    </div>
  );
}
