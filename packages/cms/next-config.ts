import type { NextConfig } from "next";

export const withCMS = (config: NextConfig) => ({
  ...config,
  images: {
    remotePatterns: [
      ...(config.images?.remotePatterns || []),
      {
        protocol: "https",
        hostname: "images.contentstack.io",
      },
      {
        protocol: "https",
        hostname: "images.cdn.us-central1.gcp.commercetools.com",
      },
    ],
  },
  allowedDevOrigins: [
    ...(config.allowedDevOrigins || []),
    "app.contentstack.com",
  ],
});
