import { createContext } from 'react-router';

// The Cloudflare Worker's bindings and execution context, available to loaders and actions via
// `context.get(cloudflareContext)`.
export const cloudflareContext = createContext<{ env: Env; ctx: ExecutionContext }>();
