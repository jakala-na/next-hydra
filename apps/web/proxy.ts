import { authProxy } from "@repo/auth/proxy";
import { cmsProxy } from "@repo/cms/proxy";
import { i18nProxy } from "@repo/i18n/proxy";
import { createNEMO } from "@rescale/nemo";
import type { GlobalMiddlewareConfig, MiddlewareConfig } from "@rescale/nemo";

export const config = {
  // Run middleware on page routes while allowing auth and Sentry tunnel handlers.
  matcher: [
    "/((?!api|_next/|_static|_vercel|ingest|monitoring).*)",
    "/api/auth/:path*",
  ],
};

const globalMiddlewares: GlobalMiddlewareConfig = {
  before: [
    cmsProxy,
    (req) => {
      // API routes are intentionally left alone.
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

const proxy = authProxy(createNEMO(middlewares, globalMiddlewares));

export default proxy;
