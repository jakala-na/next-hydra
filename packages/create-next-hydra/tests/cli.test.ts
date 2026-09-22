import { describe, expect, it, vi } from "vitest";

import type { composeDevelopmentWorkspaces } from "../src/development-workspaces.js";
import { runCli } from "../src/index.js";

describe("CLI", () => {
  it("refreshes a named workspace with dependency installation enabled", async () => {
    const compose = vi.fn<typeof composeDevelopmentWorkspaces>();
    await runCli(["node", "create-next-hydra", "compose", "cms-contentstack"], {
      composeDevelopmentWorkspaces: compose,
    });
    expect(compose).toHaveBeenCalledWith(
      "cms-contentstack",
      expect.objectContaining({ install: true })
    );
  });

  it.each([
    "--reuse",
    "--output=/tmp/site",
    "--linked",
    "--link",
    "--no-link",
    "--cms=drupal",
  ])(
    "rejects an unsupported compose option %s without invoking composition",
    async (option) => {
      const compose = vi.fn<typeof composeDevelopmentWorkspaces>();
      await expect(
        runCli(["node", "create-next-hydra", "compose", "cms-drupal", option], {
          composeDevelopmentWorkspaces: compose,
        })
      ).rejects.toThrow(
        "Compose initializes or refreshes workspaces/<name> in place"
      );
      expect(compose).not.toHaveBeenCalled();
    }
  );

  it("directs unsupported scaffold options to the named-workspace workflow", async () => {
    await expect(
      runCli(["node", "create-next-hydra", "output", "--maintainer-workspace"])
    ).rejects.toThrow("run create-next-hydra compose <name>");
  });

  it("passes the named definition and refresh options to composition", async () => {
    const compose = vi
      .fn<typeof composeDevelopmentWorkspaces>()
      .mockResolvedValue(undefined);

    await runCli(
      [
        "node",
        "create-next-hydra",
        "compose",
        "cms-contentstack",
        "--watch",
        "--copy-env",
      ],
      {
        composeDevelopmentWorkspaces: compose,
      }
    );

    expect(compose).toHaveBeenCalledWith(
      "cms-contentstack",
      expect.objectContaining({ copyEnv: true, watch: true })
    );
  });

  it("checks all definitions without installing", async () => {
    const compose = vi
      .fn<typeof composeDevelopmentWorkspaces>()
      .mockResolvedValue(undefined);

    await runCli(
      [
        "node",
        "create-next-hydra",
        "compose",
        "--all",
        "--check",
        "--no-install",
      ],
      {
        composeDevelopmentWorkspaces: compose,
      }
    );

    expect(compose).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        all: true,
        check: true,
        install: false,
      })
    );
  });

  it("passes a read-only file explanation request", async () => {
    const compose = vi
      .fn<typeof composeDevelopmentWorkspaces>()
      .mockResolvedValue(undefined);
    await runCli(
      [
        "node",
        "create-next-hydra",
        "compose",
        "cms-drupal",
        "--explain",
        "packages/cms-drupal/components/component-registry.ts",
      ],
      { composeDevelopmentWorkspaces: compose }
    );
    expect(compose).toHaveBeenCalledWith(
      "cms-drupal",
      expect.objectContaining({
        explain: "packages/cms-drupal/components/component-registry.ts",
      })
    );
  });

  it.each([
    { flag: "--explain", option: "explain" },
    { flag: "--diff", option: "diff" },
  ])(
    "accepts $flag without consuming the workspace name as a file",
    async ({ flag, option }) => {
      const compose = vi.fn<typeof composeDevelopmentWorkspaces>();
      await runCli(["node", "create-next-hydra", "compose", "example", flag], {
        composeDevelopmentWorkspaces: compose,
      });
      expect(compose).toHaveBeenCalledWith(
        "example",
        expect.objectContaining({ [option]: true })
      );
    }
  );

  it.each(["dev", "build", "test", "typecheck"])(
    "forwards the %s workspace task",
    async (task) => {
      const compose = vi
        .fn<typeof composeDevelopmentWorkspaces>()
        .mockResolvedValue(undefined);
      await runCli(
        [
          "node",
          "create-next-hydra",
          "compose",
          "cms-contentstack",
          "--run",
          task,
        ],
        { composeDevelopmentWorkspaces: compose }
      );
      expect(compose).toHaveBeenCalledWith(
        "cms-contentstack",
        expect.objectContaining({ run: task })
      );
    }
  );

  it.each([["use"], ["use", "--cms", "contentstack"], ["--yes", "use"]])(
    "rejects reserved command names without scaffolding: %j",
    async (...args) => {
      await expect(
        runCli(["node", "create-next-hydra", ...args])
      ).rejects.toThrow("Choose create-next-hydra <directory>");
    }
  );
});
