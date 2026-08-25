import baseConfig, { serverOnlyShim } from "@repo/testing";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    esbuild: {
      jsx: "automatic",
      jsxImportSource: "react",
    },
    resolve: {
      alias: {
        "server-only": serverOnlyShim,
      },
    },
  })
);
