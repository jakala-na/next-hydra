import { cmsProxy } from "@repo/cms/proxy";
import { i18nProxy } from "@repo/i18n/proxy";
import { createNEMO } from "@rescale/nemo";
import type { GlobalMiddlewareConfig, MiddlewareConfig } from "@rescale/nemo";

export const config = {
  matcher: ["/((?!api|_next/|_static|_vercel).*)"],
};

const globalMiddlewares: GlobalMiddlewareConfig = {
  before: [
    cmsProxy,
    (request) => {
      if (request.nextUrl.pathname.startsWith("/api")) {
        return;
      }

      return i18nProxy(request);
    },
  ],
};

const middlewares: MiddlewareConfig = {
  "/": () => undefined,
};

export default createNEMO(middlewares, globalMiddlewares);
