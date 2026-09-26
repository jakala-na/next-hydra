"use strict";
const path = require("node:path");
const react = require("@vitejs/plugin-react");
const { defineConfig, mergeConfig } = require("vitest/config");

const serverOnlyShim = path.resolve(__dirname, "shims/server-only.js");

const workspaceConfig = defineConfig({
  resolve: {
    alias: {
      "@repo": path.resolve(process.cwd(), "../../packages"),
      "server-only": serverOnlyShim,
    },
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
