import { withCanvas } from "@drupal-canvas/headless-next/config";
import type { NextConfig } from "next";

import { canvasProjectRoot } from "./canvas-project";
import { keys } from "./keys";

export function withCMS(config: NextConfig) {
  const cmsKeys = keys();
  const drupalUrl = new URL(cmsKeys.DRUPAL_BASE_URL);
  const canvasSiteUrl = cmsKeys.CANVAS_SITE_URL ?? drupalUrl.origin;
  const allowLocalDrupalImages =
    process.env.NODE_ENV === "development" &&
    drupalUrl.hostname.endsWith(".ddev.site");
  const protocol = drupalUrl.protocol === "http:" ? "http" : "https";

  // headless-next resolves this while next.config runs in development. Keep
  // Drupal as the default so existing Hydra environments need no extra value.
  process.env.CANVAS_SITE_URL ??= canvasSiteUrl;
  process.env.CANVAS_PROJECT_ROOT = canvasProjectRoot;

  const { headers } = config;

  const canvasOptions = {
    appRoot: process.cwd(),
    projectRoot: canvasProjectRoot,
  };

  return withCanvas(
    {
      ...config,
      allowedDevOrigins: [
        ...(config.allowedDevOrigins ?? []),
        drupalUrl.hostname,
      ],
      env: {
        ...config.env,
        CANVAS_SITE_URL: canvasSiteUrl,
      },
      headers: async () => [
        ...(headers ? await headers() : []),
        {
          headers: [
            {
              key: "Content-Security-Policy",
              value: `frame-ancestors 'self' ${drupalUrl.origin}`,
            },
          ],
          source: "/:path*",
        },
      ],
      images: {
        ...config.images,
        dangerouslyAllowLocalIP:
          config.images?.dangerouslyAllowLocalIP ?? allowLocalDrupalImages,
        remotePatterns: [
          ...(config.images?.remotePatterns ?? []),
          {
            hostname: drupalUrl.hostname,
            pathname: "/sites/default/files/**",
            port: drupalUrl.port,
            protocol,
          },
        ],
      },
    },
    canvasOptions
  );
}
