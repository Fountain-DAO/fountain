import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Server tests run inside workerd against a real local D1, migrated from ./migrations.
export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      miniflare: {
        // The newest date the test pool's bundled workerd supports. The site itself uses the date in
        // wrangler.jsonc; raise this when @cloudflare/vitest-pool-workers catches up.
        compatibilityDate: '2026-08-22',
        d1Databases: ['DB'],
        bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/apply-migrations.ts'],
  },
}));
