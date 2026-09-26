import type { NextConfig } from "next";

export function withCommerceRuntime(config: NextConfig): NextConfig {
  return {
    ...config,
    turbopack: {
      ...config.turbopack,
      resolveAlias: {
        ...config.turbopack?.resolveAlias,
        "@repo/commerce/runtime": "./lib/commerce-runtime.ts",
      },
    },
  };
}
