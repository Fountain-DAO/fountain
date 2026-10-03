import type { Route } from './+types/terms';
import { Header } from '~/welcome/header';
import { Footer } from '~/welcome/footer';

export const meta: Route.MetaFunction = () => [{ title: 'Terms of Service' }];

export default function Terms() {
  return (
    <div>
      <Header />
      Nothing here yet
      <Footer />
    </div>
  );
}
