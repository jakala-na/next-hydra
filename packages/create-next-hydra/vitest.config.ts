import path from "node:path";

import { defineConfig } from "vitest/config";

const packagesRoot = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  resolve: {
    alias: {
      "@repo": packagesRoot,
      "server-only": path.join(packagesRoot, "testing/shims/server-only.js"),
    },
  },
  test: {
    environment: "node",
  },
});
