import { cmsProxy } from "@repo/cms/proxy";
import { cmsFrameAncestors } from "@repo/cms/security";
import { i18nProxy } from "@repo/i18n/proxy";
import {
  noseconeOptions,
  noseconeProxy,
  resolveFrameAncestors,
} from "@repo/security/proxy";
import type { NoseconeOptions } from "@repo/security/proxy";
import { createNEMO } from "@zanreal/nemo";
import type { GlobalMiddlewareConfig, MiddlewareConfig } from "@zanreal/nemo";

import { env } from "./env";
/*{% echo imports %}*/

export const config = {
  matcher: [
    "/((?!api|_next/|_static|_vercel|ingest|monitoring).*)",
    /*{% if enabled.proxy %}*/
    "/api/auth/:path*",
    /*{% endif %}*/
  ],
};
const securityOptions = {
  ...noseconeOptions,
  contentSecurityPolicy: {
    // Keep framing independent of script nonces and static rendering.
    directives: {
      frameAncestors: resolveFrameAncestors(
        cmsFrameAncestors,
        env.FRAME_ANCESTORS
      ),
    },
  },
  // CMS previews and third-party resources do not require cross-origin isolation.
  crossOriginEmbedderPolicy: false,
  // frame-ancestors supports the configured cross-origin editors.
  xFrameOptions: false,
};

// SAFETY: The CMS providers and env schema validate HTTP(S) origins. Nosecone accepts
// these strings, but its beta declarations require literal hostname patterns.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Provider origins are validated HTTP(S) URLs accepted by Nosecone's serializer.
const securityProxy = noseconeProxy(securityOptions as NoseconeOptions);

const globalMiddlewares: GlobalMiddlewareConfig = {
  before: [
    securityProxy,
    cmsProxy,
    (request) => {
      if (!request.nextUrl.pathname.startsWith("/api")) {
        return i18nProxy(request);
      }
    },
  ],
};
const middlewares: MiddlewareConfig = { "/": () => undefined };
export default /*{% echo slots.proxy.open %}*/ createNEMO(
  middlewares,
  globalMiddlewares /*{% echo slots.proxy.close %}*/
);
