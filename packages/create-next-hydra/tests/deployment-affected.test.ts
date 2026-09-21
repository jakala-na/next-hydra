import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { git } from "../scripts/deployment-git.mts";
import { workspaceTaskManifest } from "../src/workspace-task-manifest.js";
import { workspaceCompositionTask } from "../src/workspace-task-sync.js";

const sourceRoot = path.resolve(import.meta.dirname, "../../..");
const cli = "packages/create-next-hydra";

describe("deployment safety and explicit overrides", () => {
  let root: string;
  let base: string;
  async function write(file: string, content: string) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  function commit(message: string) {
    git(root, ["add", "--all"]);
    git(root, [
      "-c",
      "user.name=Composition Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--allow-empty",
      "--quiet",
      "-m",
      message,
    ]);
    return git(root, ["rev-parse", "HEAD"]).trim();
  }
  function check(previous = base, force = "") {
    return spawnSync(
      process.execPath,
      [path.join(root, cli, "scripts/ignore-vercel-build.mjs")],
      {
        cwd: path.join(root, "workspaces/proof/apps/web"),
        encoding: "utf-8",
        env: {
          NODE_ENV: "test",
          PATH: `${path.join(sourceRoot, "node_modules/.bin")}:${process.env.PATH}`,
          TURBO_TELEMETRY_DISABLED: "1",
          VERCEL_FORCE_BUILD: force,
          VERCEL_GIT_PREVIOUS_SHA: previous,
        },
      }
    );
  }
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "composition-affected-"));
    git(root, ["init", "--quiet", "--initial-branch=main"]);
    await write(
      "package.json",
      '{"private":true,"packageManager":"pnpm@10.11.0"}'
    );
    await write(
      "pnpm-workspace.yaml",
      "packages:\n  - packages/*\n  - workspaces/*/tasks\n"
    );
    await write(
      "pnpm-lock.yaml",
      "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  packages/create-next-hydra: {}\n  workspaces/proof/tasks:\n    devDependencies:\n      create-next-hydra:\n        specifier: workspace:*\n        version: link:../../../packages/create-next-hydra\n"
    );
    await write(
      "turbo.json",
      JSON.stringify({
        tasks: { build: {} },
      })
    );
    await write(
      `${cli}/package.json`,
      JSON.stringify({
        name: "create-next-hydra",
        scripts: { build: "node --version" },
      })
    );
    await Promise.all(
      [
        "scripts/ignore-vercel-build.mjs",
        "scripts/deployment-git.mts",
        "src/workspace-task-manifest.ts",
      ].map(async (file) => {
        await mkdir(path.dirname(path.join(root, cli, file)), {
          recursive: true,
        });
        await copyFile(
          path.join(sourceRoot, cli, file),
          path.join(root, cli, file)
        );
      })
    );
    await write(
      "workspaces/proof/next-hydra.json",
      JSON.stringify({ providers: { cms: "fixture" } })
    );
    await write("workspaces/proof/apps/web/vercel.json", "{}");
    await write(
      "workspaces/proof/tasks/package.json",
      JSON.stringify(workspaceTaskManifest("proof"))
    );
    await write(
      "workspaces/proof/tasks/turbo.json",
      JSON.stringify(workspaceCompositionTask("proof", []))
    );
    base = commit("initial composition");
  });
  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  // Keep source trees identical so changed task inputs cannot mask a broken safety check.
  it.each(["", "a".repeat(40), "not-a-commit"])(
    "builds without a valid deployment baseline: %s",
    (previous) => {
      commit("unchanged sources");
      expect(check(previous).status).toBe(1);
    }
  );

  it("allows same-commit redeployments and force builds", () => {
    expect(check().status).toBe(1);
    commit("unchanged sources");
    expect(check(base, "1").status).toBe(1);
  });

  it.each(["package.json", "turbo.json"])(
    "builds when task metadata is missing or invalid: %s",
    async (file) => {
      commit("unchanged sources");
      const target = `workspaces/proof/tasks/${file}`;
      await rm(path.join(root, target));
      expect(check().status).toBe(1);
      await write(target, "{}");
      expect(check().status).toBe(1);
    }
  );

  it("builds when the constructor cannot account for externally owned sources", async () => {
    await write(
      "workspaces/proof/tasks/package.json",
      JSON.stringify(workspaceTaskManifest("proof", false))
    );
    base = commit("external selection");
    commit("unchanged sources");
    expect(check().status).toBe(1);
  });

  it("honors skip-ci unless explicitly forced", () => {
    commit("unchanged sources [skip ci]");
    expect(check().status).toBe(0);
    expect(check(base, "1").status).toBe(1);
  });

  it("builds if the task package is not registered in the outer workspace", async () => {
    await write("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
    base = commit("omit task registration");
    commit("unchanged sources");
    expect(check().status).toBe(1);
  });
});
