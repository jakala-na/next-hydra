import { authProxy } from "@repo/auth-workos/proxy";
import { cmsProxy } from "@repo/cms/proxy";
import { i18nProxy } from "@repo/i18n/proxy";

import {
  createNEMO,
  type GlobalMiddlewareConfig,
  type MiddlewareConfig,
} from "@rescale/nemo";

export const config = {
  // Run middleware on page routes while allowing WorkOS auth and Sentry tunnel handlers.
  matcher: [
    "/((?!api|_next/|_static|_vercel|ingest|monitoring).*)",
    "/api/auth/:path*",
  ],
};

const workosAuth = authProxy();

const globalMiddlewares: GlobalMiddlewareConfig = {
  before: [
    cmsProxy,
    // NEMO's event type is broader than NextFetchEvent, but WorkOS expects the Next type.
    (req, event) =>
      workosAuth(req, event as unknown as Parameters<typeof workosAuth>[1]),
    (req) => {
      // API routes and root-level admin routes are intentionally left alone.
      if (
        req.nextUrl.pathname.startsWith("/api") ||
        req.nextUrl.pathname === "/admin" ||
        req.nextUrl.pathname.startsWith("/admin/")
      ) {
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
