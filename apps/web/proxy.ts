import { authProxy } from "@repo/auth-workos/proxy";
import { cmsProxy } from "@repo/cms/proxy";
import { i18nProxy } from "@repo/i18n/proxy";

import {
  createNEMO,
  type GlobalMiddlewareConfig,
  type MiddlewareConfig,
} from "@rescale/nemo";

export const config = {
  // Run middleware on page routes while still allowing WorkOS auth handlers under /api/auth.
  matcher: ["/((?!api|_next/|_static|_vercel|ingest).*)", "/api/auth/:path*"],
};

const workosAuth = authProxy();

const globalMiddlewares: GlobalMiddlewareConfig = {
  before: [
    cmsProxy,
    // NEMO's event type is broader than NextFetchEvent, but WorkOS expects the Next type.
    (req, event) =>
      workosAuth(req, event as unknown as Parameters<typeof workosAuth>[1]),
    (req) => {
      // API routes are intentionally left alone; only page routes need locale handling.
      if (req.nextUrl.pathname.startsWith("/api")) {
        return;
      }

      return i18nProxy(req);
    },
  ],
};

const middlewares: MiddlewareConfig = {
  "/": () => undefined,
};

const proxy = createNEMO(middlewares, globalMiddlewares);

export default proxy;
