import path from "node:path";

import baseConfig, { serverOnlyShim } from "@repo/testing";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: /^@repo\/commerce\/runtime$/u,
          replacement: path.resolve(
            import.meta.dirname,
            "lib/commerce-runtime.ts"
          ),
        },
        {
          find: "server-only",
          replacement: serverOnlyShim,
        },
        {
          find: "@repo/auth",
          replacement: path.resolve(
            import.meta.dirname,
            "node_modules/@repo/auth"
          ),
        },
        {
          find: "@repo/cms",
          replacement: path.resolve(
            import.meta.dirname,
            "node_modules/@repo/cms"
          ),
        },
        {
          find: "@repo/commerce-provider",
          replacement: path.resolve(
            import.meta.dirname,
            "node_modules/@repo/commerce-provider"
          ),
        },
        { find: "@", replacement: import.meta.dirname },
      ],
    },
  })
);
