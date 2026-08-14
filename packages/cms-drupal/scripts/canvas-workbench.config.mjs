import { fileURLToPath } from "node:url";
import baseConfig from "@drupal-canvas/workbench/dist/server/vite.published.config.mjs";
import { imageConfigDefault } from "next/dist/shared/lib/image-config.js";

const resolvedBaseConfig = await baseConfig;
const recipeImageDir = fileURLToPath(
  new URL(
    "../../../apps/drupal/recipes/next-hydra-starter/content/file/",
    import.meta.url
  )
);
const imageConfig = {
  ...imageConfigDefault,
  unoptimized: true,
};
const browserProcess = {
  env: {
    __NEXT_IMAGE_OPTS: imageConfig,
    NODE_ENV: "development",
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
    "process.env.__NEXT_IMAGE_OPTS": JSON.stringify(imageConfig),
    "process.env.NODE_ENV": JSON.stringify("development"),
  },
  publicDir: recipeImageDir,
  resolve: {
    ...resolvedBaseConfig.resolve,
    alias: {
      ...resolvedBaseConfig.resolve?.alias,
      "server-only": fileURLToPath(
        new URL("./workbench-shims/server-only.mjs", import.meta.url)
      ),
    },
  },
};
