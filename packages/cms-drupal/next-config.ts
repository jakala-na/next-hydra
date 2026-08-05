import type { NextConfig } from "next";
import { keys } from "./keys";

export function withCMS(config: NextConfig): NextConfig {
  const drupalUrl = new URL(keys().DRUPAL_BASE_URL);
  const allowLocalDrupalImages =
    process.env.NODE_ENV === "development" &&
    drupalUrl.hostname.endsWith(".ddev.site");
  const protocol = drupalUrl.protocol === "http:" ? "http" : "https";

  return {
    ...config,
    allowedDevOrigins: [
      ...(config.allowedDevOrigins ?? []),
      drupalUrl.hostname,
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
  };
}
