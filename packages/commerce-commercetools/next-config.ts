import type { NextConfig } from "next";

export function withCommerce(config: NextConfig): NextConfig {
  return {
    ...config,
    images: {
      ...config.images,
      remotePatterns: [
        ...(config.images?.remotePatterns ?? []),
        {
          hostname: "images.cdn.us-central1.gcp.commercetools.com",
          protocol: "https",
        },
        {
          hostname: "storage.googleapis.com",
          pathname: "/merchant-center-europe/sample-data/**",
          protocol: "https",
        },
      ],
    },
  };
}
