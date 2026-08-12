import path from "node:path";
import baseConfig from "@repo/testing";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: "@repo/auth",
          replacement: path.resolve(
            import.meta.dirname,
            "node_modules/@repo/auth"
          ),
        },
        {
          find: "@repo/commerce-provider",
          replacement: path.resolve(
            import.meta.dirname,
            "node_modules/@repo/commerce-provider"
          ),
        },
        { find: "@", replacement: path.resolve(import.meta.dirname, ".") },
      ],
    },
  })
);
