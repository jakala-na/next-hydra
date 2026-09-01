import { config, withAnalyzer } from "@repo/next-config";
import { withLogging, withSentry } from "@repo/observability/next-config";
import type { NextConfig } from "next";

import { env } from "@/env";

const adminConfig = {
  ...config,
  experimental: {
    ...config.experimental,
    authInterrupts: true,
  },
} satisfies NextConfig;

const loggedConfig = withLogging(adminConfig);
const observedConfig = env.VERCEL ? withSentry(loggedConfig) : loggedConfig;
const nextConfig =
  env.ANALYZE === "true" ? withAnalyzer(observedConfig) : observedConfig;

export default nextConfig;
