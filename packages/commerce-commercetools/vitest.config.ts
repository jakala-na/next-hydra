import { serverOnlyShim } from "@repo/testing";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": serverOnlyShim,
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "**/*.live.test.ts"],
    include: ["**/*.test.ts"],
  },
});
