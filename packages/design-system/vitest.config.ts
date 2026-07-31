import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@repo/design-system": path.resolve(__dirname, "."),
      "@repo/i18n": path.resolve(__dirname, "../i18n"),
    },
  },
});
