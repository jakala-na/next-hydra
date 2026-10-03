import { configDefaults, defineConfig } from "vitest/config";

import unitConfig from "./vitest.config";

export default defineConfig({
  ...unitConfig,
  test: {
    ...unitConfig.test,
    exclude: configDefaults.exclude,
    include: ["**/*.live.test.ts"],
  },
});
