import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('./routes/home.tsx'),
  route('terms-and-conditions', './routes/terms.tsx'),
  route('privacy-policy', './routes/privacy.tsx'),
] satisfies RouteConfig;
