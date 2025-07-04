import createMiddleware from 'next-intl/middleware';
import { routing } from './routing';

// Create middleware to handle i18n routing
// Docs:
// - https://nextjs.org/docs/app/building-your-application/routing/internationalization
// - https://github.com/vercel/next.js/tree/canary/examples/i18n-routing
// - https://next-intl.dev/docs/routing/middleware

export const i18nMiddleware: ReturnType<typeof createMiddleware> =
  createMiddleware(routing);
