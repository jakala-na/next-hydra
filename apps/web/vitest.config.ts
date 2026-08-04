import path from "node:path";
import baseConfig from "@repo/testing";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: "@repo/cms",
          replacement: path.resolve(
            import.meta.dirname,
            "node_modules/@repo/cms"
          ),
        },
        { find: "@", replacement: import.meta.dirname },
      ],
    },
  })
);
