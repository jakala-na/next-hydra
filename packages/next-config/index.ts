import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const otelRegex = /@opentelemetry\/instrumentation/u;

export const baseConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    useTypeScriptCli: true,
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

  transpilePackages: ["@repo/observability"],
  typedRoutes: true,
  typescript: {
    ignoreBuildErrors: true,
  },

  webpack(webpackConfig: { ignoreWarnings?: { module: RegExp }[] }) {
    webpackConfig.ignoreWarnings = [{ module: otelRegex }];

    return webpackConfig;
  },
};

// The reference web application includes analytics; backend applications use
// baseConfig and do not expose the analytics ingestion proxy.
export const config: NextConfig = {
  ...baseConfig,
  // oxlint-disable-next-line require-await -- Next requires rewrites to be async.
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
  skipTrailingSlashRedirect: true,
};

export const withAnalyzer = (sourceConfig: NextConfig): NextConfig =>
  withBundleAnalyzer()(sourceConfig);
