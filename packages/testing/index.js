"use strict";
const path = require("node:path");
const { realpathSync } = require("node:fs");
const react = require("@vitejs/plugin-react");
const { defineConfig, mergeConfig } = require("vitest/config");

const serverOnlyShim = path.resolve(__dirname, "shims/server-only.js");

const workspaceConfig = defineConfig({
  plugins: [
    {
      enforce: "pre",
      name: "dependency-realpaths",
      async resolveId(id, importer, options) {
        // Preserve workspace source links, but resolve external packages at their
        // pnpm store locations so their own transitive dependencies stay visible.
        if (
          id.startsWith(".") ||
          path.isAbsolute(id) ||
          id.startsWith("@repo/") ||
          id.startsWith("@/") ||
          id.startsWith("@composition/") ||
          id.startsWith("\0")
        ) {
          return null;
        }
        const resolved = await this.resolve(id, importer, {
          ...options,
          skipSelf: true,
        });
        if (
          !resolved ||
          Boolean(resolved.external) ||
          !path.isAbsolute(resolved.id)
        ) {
          return resolved;
        }
        const query = resolved.id.indexOf("?");
        const filename =
          query === -1 ? resolved.id : resolved.id.slice(0, query);
        const suffix = query === -1 ? "" : resolved.id.slice(query);
        return { ...resolved, id: realpathSync(filename) + suffix };
      },
    },
  ],
  resolve: {
    alias: {
      "@repo": path.resolve(process.cwd(), "../../packages"),
      "server-only": serverOnlyShim,
    },
    preserveSymlinks: true,
  },
});

const config = mergeConfig(
  workspaceConfig,
  defineConfig({
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./"),
      },
    },
    test: { environment: "jsdom" },
  })
);

module.exports = config;
module.exports.serverOnlyShim = serverOnlyShim;
module.exports.workspaceConfig = workspaceConfig;
