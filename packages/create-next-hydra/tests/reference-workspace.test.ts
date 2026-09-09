/* oxlint-disable vitest/max-expects -- Verify selection, resolution, and process ownership as one runner contract. */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { updateDevelopmentWorkspace } from "../src/development-workspaces.js";
import type { runCommand } from "../src/git.js";
import {
  REFERENCE_WORKSPACE_NAME,
  testReferenceWorkspace,
} from "../src/reference-workspace.js";

describe("reference storefront test runner", () => {
  let root: string;
  let target: string;
  const update = vi.fn<typeof updateDevelopmentWorkspace>();
  const run = vi.fn<typeof runCommand>();
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "reference-tests-"));
    target = path.join(root, "workspaces", REFERENCE_WORKSPACE_NAME);
    await mkdir(target, { recursive: true });
    await writeFile(
      path.join(target, "next-hydra.json"),
      JSON.stringify({
        addOns: [],
        providers: {
          auth: "workos",
          cms: "contentstack",
          commerce: "commercetools",
        },
      })
    );
    const packages = [
      "auth-workos",
      "cms-contentstack",
      "commerce-commercetools",
    ];
    await Promise.all(
      packages.map(
        async (name) =>
          await mkdir(path.join(target, "packages", name), { recursive: true })
      )
    );
    await Promise.all(
      ["web", "api", "admin"].map(async (app) => {
        const appRoot = path.join(target, "apps", app);
        const dependencies = {
          "@repo/auth": "workspace:@repo/auth-workos@*",
          "@repo/cms": "workspace:@repo/cms-contentstack@*",
          "@repo/commerce-provider": "workspace:@repo/commerce-commercetools@*",
        };
        await mkdir(path.join(appRoot, "node_modules/@repo"), {
          recursive: true,
        });
        await writeFile(
          path.join(appRoot, "package.json"),
          JSON.stringify({ dependencies })
        );
        await Promise.all(
          Object.entries({
            auth: "auth-workos",
            cms: "cms-contentstack",
            "commerce-provider": "commerce-commercetools",
          }).map(async ([alias, provider]) => {
            await symlink(
              path.join(target, "packages", provider),
              path.join(appRoot, "node_modules/@repo", alias)
            );
          })
        );
      })
    );
    update.mockReset().mockResolvedValue({
      changed: 0,
      conflicts: [],
      needsInstall: false,
      origins: [],
      removed: 0,
      unowned: [],
    });
    run.mockReset().mockResolvedValue({ stderr: "", stdout: "" });
  });
  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("refreshes one reference and runs only application suites in its dependency graph", async () => {
    await testReferenceWorkspace(root, { run, update });
    expect(update).toHaveBeenCalledExactlyOnceWith(
      root,
      "storefront-contentstack"
    );
    expect(run).toHaveBeenCalledExactlyOnceWith(
      "pnpm",
      [
        "exec",
        "turbo",
        "run",
        "test",
        "--filter=./apps/*",
        "--only",
        "--continue=always",
      ],
      { cwd: target, inheritStdio: true }
    );
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(
      run.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("rejects changes to the pinned providers before updating", async () => {
    await writeFile(
      path.join(target, "next-hydra.json"),
      JSON.stringify({
        addOns: [],
        providers: {
          auth: "clerk",
          cms: "contentstack",
          commerce: "commercetools",
        },
      })
    );
    await expect(testReferenceWorkspace(root, { run, update })).rejects.toThrow(
      "WorkOS, Contentstack and commercetools"
    );
    expect(update).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("does not fall back to source checkout dependencies", async () => {
    const link = path.join(target, "apps/web/node_modules/@repo/auth");
    const source = path.join(root, "packages/auth-workos");
    await mkdir(source, { recursive: true });
    await rm(link);
    await symlink(source, link);
    await expect(testReferenceWorkspace(root, { run, update })).rejects.toThrow(
      "not the source checkout"
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses pending installs and propagates test failures", async () => {
    update.mockResolvedValueOnce({
      changed: 0,
      conflicts: [],
      needsInstall: true,
      origins: [],
      removed: 0,
      unowned: [],
    });
    await expect(testReferenceWorkspace(root, { run, update })).rejects.toThrow(
      "refreshed and installed"
    );
    expect(run).not.toHaveBeenCalled();
    run.mockRejectedValueOnce(new Error("application suite failed"));
    await expect(testReferenceWorkspace(root, { run, update })).rejects.toThrow(
      "application suite failed"
    );
  });
});
