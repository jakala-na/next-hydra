import type { NextConfig } from "next";

export const withCMS = (config: NextConfig) => ({
  ...config,
  allowedDevOrigins: [
    ...(config.allowedDevOrigins ?? []),
    "app.contentful.com",
    "preview.contentful.com",
  ],
  images: {
    remotePatterns: [
      ...(config.images?.remotePatterns ?? []),
      {
        hostname: "images.ctfassets.net",
        protocol: "https",
      },
      {
        hostname: "preview.ctfassets.net",
        protocol: "https",
      },
      {
        hostname: "images.cdn.us-central1.gcp.commercetools.com",
        protocol: "https",
      },
    ],
  },
});
