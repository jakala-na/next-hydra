import { withCanvas } from "@drupal-canvas/headless-next/config";
import { resolveFrameAncestors } from "@drupal-canvas/headless/server";
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
  // Drupal as the default and pass the validated value to the SDK.
  process.env.CANVAS_SITE_URL = canvasSiteUrl;
  process.env.CANVAS_PROJECT_ROOT = canvasProjectRoot;

  // Embedded previews need access to development scripts as well as framing.
  const editorHostnames = resolveFrameAncestors()
    .split(/\s+/u)
    .filter((origin) => origin !== "'self'")
    .map((origin) => new URL(origin).hostname);

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
        ...editorHostnames,
      ],
      env: {
        ...config.env,
        CANVAS_SITE_URL: canvasSiteUrl,
      },
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
