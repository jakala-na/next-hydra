import { workspaceConfig } from "@repo/testing";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  workspaceConfig,
  defineConfig({
    test: {
      include: ["**/*.test.ts"],
    },
  })
);
