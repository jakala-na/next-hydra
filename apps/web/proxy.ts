import { authProxy } from "@repo/auth/proxy";
import { cmsProxy } from "@repo/cms/proxy";
import { cmsFrameAncestors } from "@repo/cms/security";
import { i18nProxy } from "@repo/i18n/proxy";
import { noseconeOptions, noseconeProxy } from "@repo/security/proxy";
import type { NoseconeOptions } from "@repo/security/proxy";
import { createNEMO } from "@zanreal/nemo";
import type { GlobalMiddlewareConfig, MiddlewareConfig } from "@zanreal/nemo";

export const config = {
  // Run middleware on page routes while allowing auth and Sentry tunnel handlers.
  matcher: [
    "/((?!api|_next/|_static|_vercel|ingest|monitoring).*)",
    "/api/auth/:path*",
  ],
};

const securityOptions = {
  ...noseconeOptions,
  contentSecurityPolicy: {
    // Keep framing independent of script nonces and static rendering.
    directives: { frameAncestors: ["'self'", ...cmsFrameAncestors] },
  },
  // CMS previews and third-party resources do not require cross-origin isolation.
  crossOriginEmbedderPolicy: false,
  // frame-ancestors supports the configured cross-origin editors.
  xFrameOptions: false,
};

// SAFETY: The CMS providers resolve validated HTTP(S) origins. Nosecone accepts
// these strings, but its beta declarations require literal hostname patterns.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Provider origins are validated HTTP(S) URLs accepted by Nosecone's serializer.
const securityProxy = noseconeProxy(securityOptions as NoseconeOptions);

const globalMiddlewares: GlobalMiddlewareConfig = {
  before: [
    securityProxy,
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
