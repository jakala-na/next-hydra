import { serverOnlyShim } from "@repo/testing";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": serverOnlyShim,
    },
    preserveSymlinks: true,
  },
  test: {
    include: ["**/*.test.ts"],
  },
});
