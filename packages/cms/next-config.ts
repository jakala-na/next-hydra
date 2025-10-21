import type { NextConfig } from "next";

export const withCMS = (config: NextConfig) => ({
  ...config,
  images: {
    remotePatterns: [
      ...(config.images?.remotePatterns || []),
      {
        protocol: "https",
        hostname: "img.uniform.global",
      },
    ],
  },
  allowedDevOrigins: [
    ...(config.allowedDevOrigins || []),
  ],
});
