import { authProxy } from "@repo/auth-workos/proxy";
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
  // Note: /api/auth/* is included for WorkOS auth handling, other API routes are excluded.
  matcher: ["/((?!api|_next/|_static|_vercel|ingest).*)", "/api/auth/:path*"],
};

// WorkOS auth middleware instance
const workosAuth = authProxy();

const globalMiddlewares: GlobalMiddlewareConfig = {
  before: [
    cmsProxy,
    // WorkOS auth middleware - runs on all routes for server-side auth support
    (req, event) => {
      const response = workosAuth(
        req,
        event as unknown as Parameters<typeof workosAuth>[1]
      );

      return response;
    },
    // i18n middleware - skip for API routes
    (req) => {
      if (req.nextUrl.pathname.startsWith("/api")) {
        return;
      }

      const response = i18nProxy(req);

      if (!response?.ok) {
        return response;
      }

      return response;
    },
  ],
};

const middlewares: MiddlewareConfig = {
  // biome-ignore lint/suspicious/noEmptyBlockStatements: no-op placeholder
  "/": () => {}, // Path-based middlewares are not needed for now.
};

const proxy = createNEMO(middlewares, globalMiddlewares);

export default proxy;
