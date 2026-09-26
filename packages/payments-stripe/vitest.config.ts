import baseConfig, { serverOnlyShim } from "@repo/testing";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: {
        "server-only": serverOnlyShim,
      },
    },
  })
);
