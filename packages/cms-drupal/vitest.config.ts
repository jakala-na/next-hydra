import { serverOnlyShim } from "@repo/testing";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": serverOnlyShim,
    },
  },
  test: { server: { deps: { inline: ["@drupal-canvas/headless-next"] } } },
});
