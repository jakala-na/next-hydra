import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // CLI integration tests launch Git, Node workers and package managers.
    // This is a hang guard, not a five-second performance contract.
    testTimeout: 30_000,
  },
});
