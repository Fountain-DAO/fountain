import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  // A fixed port, so the Sign in with X callback URL registered with X always matches.
  server: { port: 5180, strictPort: true },
  plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), reactRouter()],
});
