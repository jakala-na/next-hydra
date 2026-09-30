import type { NextConfig } from "next";

export function withSearchRuntime(config: NextConfig): NextConfig {
  return {
    ...config,
    turbopack: {
      ...config.turbopack,
      resolveAlias: {
        ...config.turbopack?.resolveAlias,
        "@repo/search/runtime": "./lib/search-runtime.ts",
      },
    },
  };
}
