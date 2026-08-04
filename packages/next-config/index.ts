import withBundleAnalyzer from "@next/bundle-analyzer";

import type { NextConfig } from "next";

const otelRegex = /@opentelemetry\/instrumentation/;

export const config: NextConfig = {
  cacheComponents: false, // Waiting for https://github.com/amannn/next-intl/issues/1493 support and other ecosystem updates.
  experimental: {
    useCache: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        hostname: "img.clerk.com",
        protocol: "https",
      },
      {
        hostname: "storage.googleapis.com",
        protocol: "https",
      },
    ],
  },
  logging: {
    browserToTerminal: true,
    fetches: {
      fullUrl: true,
    },
  },

  // biome-ignore lint/suspicious/useAwait: rewrites is async
  async rewrites() {
    return [
      {
        destination: "https://us-assets.i.posthog.com/static/:path*",
        source: "/ingest/static/:path*",
      },
      {
        destination: "https://us.i.posthog.com/:path*",
        source: "/ingest/:path*",
      },
      {
        destination: "https://us.i.posthog.com/decide",
        source: "/ingest/decide",
      },
    ];
  },

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
  typedRoutes: true,
  typescript: {
    ignoreBuildErrors: true,
  },

  webpack(webpackConfig) {
    webpackConfig.ignoreWarnings = [{ module: otelRegex }];

    return webpackConfig;
  },
};

export const withAnalyzer = (sourceConfig: NextConfig): NextConfig =>
  withBundleAnalyzer()(sourceConfig);
