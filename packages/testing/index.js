"use strict";
const path = require("node:path");
const react = require("@vitejs/plugin-react");
const { defineConfig } = require("vitest/config");

const serverOnlyShim = path.resolve(__dirname, "shims/server-only.js");

const config = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@repo": path.resolve(__dirname, "../../packages"),
      "server-only": serverOnlyShim,
    },
  },
  test: {
    environment: "jsdom",
  },
});

module.exports = config;
module.exports.serverOnlyShim = serverOnlyShim;
