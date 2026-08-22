import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { loadCliConfigProvider } from "./config-provider";

const TEST_ENVIRONMENT_KEY = "CLI_CONFIG_PROVIDER_TEST";
const originalValue = process.env[TEST_ENVIRONMENT_KEY];

describe("CLI config provider", () => {
  afterEach(() => {
    if (originalValue === undefined) {
      Reflect.deleteProperty(process.env, TEST_ENVIRONMENT_KEY);
    } else {
      process.env[TEST_ENVIRONMENT_KEY] = originalValue;
    }
  });

  it("lets an explicit env file override inherited values", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "next-hydra-env-"));
    const envFile = path.join(directory, "project.env");

    try {
      process.env[TEST_ENVIRONMENT_KEY] = "inherited";
      await writeFile(envFile, `${TEST_ENVIRONMENT_KEY}=from-file`, "utf-8");

      const value = await loadCliConfigProvider(envFile).pipe(
        Effect.flatMap((provider) => provider.load([TEST_ENVIRONMENT_KEY])),
        Effect.provide(NodeServices.layer),
        Effect.runPromise
      );

      expect(value?.value).toBe("from-file");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
