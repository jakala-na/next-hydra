import { describe, expect, it } from "vitest";

import packageManifest from "../package.json" with { type: "json" };
import { runCli } from "../src/index.js";
import { CLI_VERSION } from "../src/version.js";

describe("CLI", () => {
  it("reports the version from the published package manifest", () => {
    expect(CLI_VERSION).toBe(packageManifest.version);
  });

  it("passes provider options after use to the composition command", async () => {
    let received: unknown;

    await runCli(
      ["node", "create-next-hydra", "use", "--cms", "contentstack"],
      {
        useComposition: async (options) => {
          received = options;
          await Promise.resolve();
        },
      }
    );

    expect(received).toMatchObject({ cms: "contentstack" });
  });

  it("passes safety options to the composition command", async () => {
    let received: unknown;

    await runCli(
      [
        "node",
        "create-next-hydra",
        "use",
        "--cms",
        "contentstack",
        "--dry-run",
        "--yes",
      ],
      {
        useComposition: async (options) => {
          received = options;
          await Promise.resolve();
        },
      }
    );

    expect(received).toMatchObject({
      cms: "contentstack",
      dryRun: true,
      yes: true,
    });
  });
});
