import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('./routes/home.tsx'),
  route('terms-and-conditions', './routes/terms.tsx'),
  route('privacy-policy', './routes/privacy.tsx'),
  route('auth/x', './routes/auth-x.tsx'),
  route('auth/x/callback', './routes/auth-x-callback.tsx'),
  route('join', './routes/join.tsx'),
  route('account', './routes/account.tsx'),
] satisfies RouteConfig;
