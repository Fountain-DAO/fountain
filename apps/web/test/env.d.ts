declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: import('@cloudflare/vitest-pool-workers').D1Migration[];
  }
}
