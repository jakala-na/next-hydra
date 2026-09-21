import { fileURLToPath } from "node:url";

import baseConfig from "@drupal-canvas/workbench/dist/server/vite.published.config.mjs";
import { imageConfigDefault } from "next/dist/shared/lib/image-config.js";

const resolvedBaseConfig = await baseConfig;
const baseAliases = resolvedBaseConfig.resolve?.alias ?? {};
const aliases = Symbol.iterator in baseAliases
  ? [...baseAliases]
  : Object.entries(baseAliases).map(([find, replacement]) => ({
      find,
      replacement,
    }));
const recipeImageDir = fileURLToPath(
  new URL(
    "../../../apps/drupal/recipes/next-hydra-base/content/file/",
    import.meta.url
  )
);
const imageConfig = {
  ...imageConfigDefault,
  unoptimized: true,
};
const browserProcess = {
  env: {
    NODE_ENV: "development",
    __NEXT_IMAGE_OPTS: imageConfig,
  },
};

export default {
  ...resolvedBaseConfig,
  define: {
    ...resolvedBaseConfig.define,
    __dirname: JSON.stringify("/"),
    __filename: JSON.stringify("/workbench-preview.js"),
    process: JSON.stringify(browserProcess),
    "process.env": JSON.stringify(browserProcess.env),
    "process.env.NODE_ENV": JSON.stringify("development"),
    "process.env.__NEXT_IMAGE_OPTS": JSON.stringify(imageConfig),
  },
  publicDir: recipeImageDir,
  resolve: {
    ...resolvedBaseConfig.resolve,
    alias: [
      {
        find: "server-only",
        replacement: fileURLToPath(
          new URL("workbench-shims/server-only.mjs", import.meta.url)
        ),
      },
      ...aliases,
    ],
  },
};
