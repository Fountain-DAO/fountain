import type { Config } from '@react-router/dev/config';

export default {
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  // Content pages are built as static HTML. Pages with live data should stay server-rendered.
  prerender: ['/', '/terms-and-conditions', '/privacy-policy'],
} satisfies Config;
