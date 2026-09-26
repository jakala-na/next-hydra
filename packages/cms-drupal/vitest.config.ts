import { serverOnlyShim } from "@repo/testing";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": serverOnlyShim,
    },
  },
  test: {
    server: {
      deps: {
        // Resolve Next's extensionless imports through Vite, without mocking navigation.
        inline: ["next-intl"],
      },
    },
  },
});
