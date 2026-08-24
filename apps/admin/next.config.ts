import { config, withAnalyzer } from "@repo/next-config";
import { withLogging, withSentry } from "@repo/observability/next-config";

import { env } from "@/env";

const loggedConfig = withLogging(config);
const observedConfig = env.VERCEL ? withSentry(loggedConfig) : loggedConfig;
const nextConfig =
  env.ANALYZE === "true" ? withAnalyzer(observedConfig) : observedConfig;

export default nextConfig;
