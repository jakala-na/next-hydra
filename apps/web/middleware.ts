import { cmsMiddleware } from '@repo/cms/middleware';
import { i18nMiddleware } from '@repo/i18n/middleware';

import {
  createNEMO,
  type GlobalMiddlewareConfig,
  type MiddlewareConfig,
} from '@rescale/nemo';

export const config = {
  // matcher tells Next.js which routes to run the middleware on. This runs the
  // middleware on all routes except for static assets and Posthog ingest
  matcher: ['/((?!api|_next/|_static|_vercel|ingest|[\\w-]+\\.\\w+).*)'],
};

const globalMiddlewares: GlobalMiddlewareConfig = {
  before: [cmsMiddleware, i18nMiddleware],
};

const middlewares: MiddlewareConfig = {
  // biome-ignore lint/suspicious/noEmptyBlockStatements: no-op placeholder
  '/': () => {}, // Path-based middlewares are not needed for now.
};

const middleware = createNEMO(middlewares, globalMiddlewares);

export default middleware;
