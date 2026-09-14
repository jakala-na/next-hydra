import { describe, expect, it, vi } from "vitest";

import packageManifest from "../package.json" with { type: "json" };
import type { composeDevelopmentWorkspaces } from "../src/development-workspaces.js";
import { runCli } from "../src/index.js";
import { CLI_VERSION } from "../src/version.js";

describe("CLI", () => {
  it("refreshes the same named workspace with physical sources when linking is disabled", async () => {
    const compose = vi.fn<typeof composeDevelopmentWorkspaces>();
    await runCli(
      ["node", "create-next-hydra", "compose", "cms-contentstack", "--no-link"],
      { composeDevelopmentWorkspaces: compose }
    );
    expect(compose).toHaveBeenCalledWith(
      "cms-contentstack",
      expect.objectContaining({ install: true, link: false })
    );
  });

  it.each(["--reuse", "--output=/tmp/site", "--linked", "--cms=drupal"])(
    "rejects the removed compose option %s without invoking composition",
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

  it("rejects local credential overlays for copied deployment workspaces", async () => {
    const compose = vi.fn<typeof composeDevelopmentWorkspaces>();
    await expect(
      runCli(
        [
          "node",
          "create-next-hydra",
          "compose",
          "cms-drupal",
          "--no-link",
          "--copy-env",
        ],
        { composeDevelopmentWorkspaces: compose }
      )
    ).rejects.toThrow("--copy-env is for linked development");
    expect(compose).not.toHaveBeenCalled();
  });

  it("rejects the retired maintainer flag with named-workspace migration instructions", async () => {
    await expect(
      runCli(["node", "create-next-hydra", "output", "--maintainer-workspace"])
    ).rejects.toThrow("compose <name> --copy-env");
  });

  it("reports the version from the published package manifest", () => {
    expect(CLI_VERSION).toBe(packageManifest.version);
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
      expect.objectContaining({ copyEnv: true, link: true, watch: true })
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
    "rejects retired use invocations without scaffolding: %j",
    async (...args) => {
      await expect(
        runCli(["node", "create-next-hydra", ...args])
      ).rejects.toThrow("The use command has been removed");
    }
  );
});
