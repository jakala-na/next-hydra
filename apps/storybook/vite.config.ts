import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  define: {
    global: "globalThis",
  },
  json: {
    stringify: true,
  },
  resolve: {
    alias: {
      "@repo": resolve(__dirname, "../../packages"),
    },
  },
});
