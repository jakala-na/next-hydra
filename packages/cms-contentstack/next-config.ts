import type { NextConfig } from "next";

export const withCMS = (config: NextConfig) => ({
  ...config,
  allowedDevOrigins: [
    ...(config.allowedDevOrigins || []),
    "app.contentstack.com",
  ],
  images: {
    remotePatterns: [
      ...(config.images?.remotePatterns || []),
      {
        hostname: "images.contentstack.io",
        protocol: "https",
      },
      {
        hostname: "images.cdn.us-central1.gcp.commercetools.com",
        protocol: "https",
      },
    ],
  },
});
