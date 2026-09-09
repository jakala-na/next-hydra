import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { preserveSymlinks: true },
  test: {
    clearMocks: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
