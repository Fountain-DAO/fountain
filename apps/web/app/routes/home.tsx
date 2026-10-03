import type { Route } from './+types/home';
import { Welcome } from '../welcome/welcome';

export const meta: Route.MetaFunction = () => [
  { title: 'Fountain' },
  {
    name: 'description',
    content:
      "A market for open questions in science, maths and technology. Stake points, make your case with evidence, and earn the most when you're right first.",
  },
];

export default function Home() {
  return <Welcome />;
}
