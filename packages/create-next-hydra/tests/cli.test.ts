import { describe, expect, it } from "vitest";

import { runCli } from "../src/index.js";

describe("CLI", () => {
  it("passes provider options after use to the composition command", async () => {
    let received: unknown;

    await runCli(
      ["node", "create-next-hydra", "use", "--cms", "contentstack"],
      {
        useComposition: async (options) => {
          received = options;
          return;
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
          return;
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
