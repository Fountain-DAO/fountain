import { createRequestHandler, RouterContextProvider } from 'react-router';
import { settleDue } from '../app/.server/market';
import { cloudflareContext } from '../app/context';

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

export default {
  fetch(request, env, ctx) {
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(request, context);
  },

  // Runs every minute (see triggers in wrangler.jsonc). Trades already refuse a claim whose clock
  // has filled, so this only records settlements and pays out; running late or twice is harmless.
  async scheduled(controller, env) {
    const settled = await settleDue(env.DB, controller.scheduledTime);
    if (settled.length > 0) console.log(`Settled ${settled.length} claim(s)`);
  },
} satisfies ExportedHandler<Env>;
