import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  environmentFileFromArguments,
  loadEnvironmentFile,
} from "./environment";

const TEST_ENVIRONMENT_KEY = "CLI_ENVIRONMENT_TEST";
const originalValue = process.env[TEST_ENVIRONMENT_KEY];

afterEach(() => {
  if (originalValue === undefined) {
    delete process.env[TEST_ENVIRONMENT_KEY];
  } else {
    process.env[TEST_ENVIRONMENT_KEY] = originalValue;
  }
});

describe("CLI environment", () => {
  it("reads the global env-file option in either supported form", () => {
    expect(
      environmentFileFromArguments(["node", "cli", "--env-file", "stage.env"])
    ).toBe("stage.env");
    expect(
      environmentFileFromArguments(["node", "cli", "--env-file=prod.env"])
    ).toBe("prod.env");
  });

  it("rejects an env-file option without a path", () => {
    expect(() =>
      environmentFileFromArguments(["node", "cli", "--env-file"])
    ).toThrow("--env-file requires a path");
    expect(() =>
      environmentFileFromArguments(["node", "cli", "--env-file="])
    ).toThrow("--env-file requires a path");
  });

  it("lets an explicit env file override inherited values", async () => {
    const directory = await mkdtemp(join(tmpdir(), "next-hydra-env-"));
    const envFile = join(directory, "project.env");

    try {
      process.env[TEST_ENVIRONMENT_KEY] = "inherited";
      await writeFile(envFile, `${TEST_ENVIRONMENT_KEY}=from-file`, "utf-8");

      loadEnvironmentFile(envFile);

      expect(process.env[TEST_ENVIRONMENT_KEY]).toBe("from-file");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
