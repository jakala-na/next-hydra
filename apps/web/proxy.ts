import { cmsProxy } from "@repo/cms/proxy";
import { i18nProxy } from "@repo/i18n/proxy";

import {
  createNEMO,
  type GlobalMiddlewareConfig,
  type MiddlewareConfig,
} from "@rescale/nemo";

export const config = {
  // matcher tells Next.js which routes to run the middleware on. This runs the
  // middleware on all routes except for static assets and Posthog ingest. Keep in mind all routable files from apps/ directory
  // like icon.png need the middleware to properly respond on /[locale] paths.
  matcher: ["/((?!api|_next/|_static|_vercel|ingest).*)"],
};

const globalMiddlewares: GlobalMiddlewareConfig = {
  before: [cmsProxy, i18nProxy],
};

const middlewares: MiddlewareConfig = {
  // biome-ignore lint/suspicious/noEmptyBlockStatements: no-op placeholder
  "/": () => {}, // Path-based middlewares are not needed for now.
};

const proxy = createNEMO(middlewares, globalMiddlewares);

export default proxy;
