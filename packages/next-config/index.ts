import withBundleAnalyzer from "@next/bundle-analyzer";

import type { NextConfig } from "next";

const otelRegex = /@opentelemetry\/instrumentation/;

export const config: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    useCache: true,
    browserDebugInfoInTerminal: true,
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  cacheComponents: false, // Waiting for https://github.com/amannn/next-intl/issues/1493 support and other ecosystem updates.
  typedRoutes: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
    ],
  },

  // biome-ignore lint/suspicious/useAwait: rewrites is async
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "https://us.i.posthog.com/decide",
      },
    ];
  },

  webpack(webpackConfig) {
    webpackConfig.ignoreWarnings = [{ module: otelRegex }];

    return webpackConfig;
  },

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export const withAnalyzer = (sourceConfig: NextConfig): NextConfig =>
  withBundleAnalyzer()(sourceConfig);
