import path from "node:path";

import baseConfig, { serverOnlyShim } from "@repo/testing";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
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
        { find: "@", replacement: import.meta.dirname },
      ],
    },
  })
);
