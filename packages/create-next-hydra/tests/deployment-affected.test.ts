import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { git } from "../scripts/deployment-git.mts";
import { workspaceTaskManifest } from "../src/workspace-task-manifest.js";
import { workspaceCompositionTask } from "../src/workspace-task-sync.js";

const sourceRoot = path.resolve(import.meta.dirname, "../../..");
const cli = "packages/create-next-hydra";

describe("native Turbo deployment selection before installation", () => {
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
      "--quiet",
      "-m",
      message,
    ]);
    return git(root, ["rev-parse", "HEAD"]).trim();
  }
  function check(name = "content", previous = base, force = "") {
    return spawnSync(
      process.execPath,
      [path.join(root, cli, "scripts/ignore-vercel-build.mjs")],
      {
        cwd: path.join(root, "workspaces", name, "apps/web"),
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
      "packages:\n  - packages/*\n  - apps/*\n  - workspaces/*/tasks\n"
    );
    await write(
      "pnpm-lock.yaml",
      "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  packages/create-next-hydra: {}\n  apps/web: {}\n  packages/cms-contentstack: {}\n  packages/cms-drupal: {}\n  packages/commerce: {}\n  workspaces/content/tasks:\n    devDependencies:\n      create-next-hydra:\n        specifier: workspace:*\n        version: link:../../../packages/create-next-hydra\n  workspaces/storefront/tasks:\n    devDependencies:\n      create-next-hydra:\n        specifier: workspace:*\n        version: link:../../../packages/create-next-hydra\n"
    );
    await write(
      "turbo.json",
      JSON.stringify({
        futureFlags: { affectedUsingTaskInputs: true },
        tasks: { build: {}, typecheck: {} },
      })
    );
    await Promise.all(
      [
        "apps/web",
        "packages/cms-contentstack",
        "packages/cms-drupal",
        "packages/commerce",
      ].map(async (directory) => {
        await write(
          `${directory}/package.json`,
          JSON.stringify({ name: path.basename(directory) })
        );
      })
    );
    await write(
      `${cli}/package.json`,
      JSON.stringify({
        name: "create-next-hydra",
        scripts: { build: "node --version", typecheck: "node --version" },
      })
    );
    await Promise.all(
      [
        "scripts/ignore-vercel-build.mjs",
        "scripts/deployment-git.mts",
        "src/workspace-task-manifest.ts",
        "turbo.json",
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
    await Promise.all(
      ["content", "storefront"].map(async (name) => {
        const cms = name === "content" ? "contentstack" : "drupal";
        await write(
          `workspaces/${name}/next-hydra.json`,
          JSON.stringify({ addOns: [], providers: { cms } })
        );
        await write(`workspaces/${name}/apps/web/vercel.json`, "{}");
        await write(
          `workspaces/${name}/tasks/package.json`,
          JSON.stringify(workspaceTaskManifest(name))
        );
        await write(
          `workspaces/${name}/tasks/turbo.json`,
          JSON.stringify(
            workspaceCompositionTask(name, [
              "apps/web/layout.tsx",
              `packages/cms-${cms}/component.ts`,
              ...(name === "storefront" ? ["packages/commerce/cart.ts"] : []),
            ])
          )
        );
      })
    );
    await write(
      "packages/cms-drupal/component.ts",
      "export const version = 1;"
    );
    await write(`${cli}/tests/example.test.ts`, "initial test");
    base = commit("initial composition");
  });
  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("skips CLI-test-only edits with no installation or composed apps", async () => {
    await write(`${cli}/tests/example.test.ts`, "longer timeout");
    commit("test timeout");
    expect(check()).toMatchObject({
      status: 0,
      stdout: "Skipping: Turbo found no affected build for content.\n",
    });
    await expect(
      readFile(path.join(root, "node_modules/.modules.yaml"))
    ).rejects.toThrow("ENOENT");
    await expect(
      readFile(path.join(root, "workspaces/content/apps/web/package.json"))
    ).rejects.toThrow("ENOENT");
  });

  it("detects new selected provider sources without selecting another composition", async () => {
    await write("packages/cms-drupal/new-component.ts", "new implementation");
    commit("Drupal source");
    expect(check("content").status).toBe(0);
    expect(check("storefront").status).toBe(1);
  });

  it("counts selected package tests but excludes unselected commerce", async () => {
    await write("packages/commerce/cart.test.ts", "regression");
    commit("Commerce regression");
    expect(check("content").status).toBe(0);
    expect(check("storefront").status).toBe(1);
  });

  it("detects both sides of a source move", async () => {
    await rename(
      path.join(root, "packages/cms-drupal/component.ts"),
      path.join(root, "packages/cms-contentstack/component.ts")
    );
    commit("move component");
    expect(check("content").status).toBe(1);
    expect(check("storefront").status).toBe(1);
  });

  it("includes all changes since the last successful deployment", async () => {
    await write("apps/web/layout.tsx", "new layout");
    commit("not yet deployed");
    await write(`${cli}/tests/example.test.ts`, "test timeout");
    commit("unrelated follow-up");
    expect(check().status).toBe(1);
  });

  it.each([
    "registry.json",
    "packages/cms-drupal/registry.json",
    "packages/cms-drupal/package.json",
    `${cli}/src/planner.ts`,
    "pnpm-lock.yaml",
    "workspaces/content/next-hydra.json",
    "workspaces/content/apps/web/vercel.json",
  ])("includes planning and deployment metadata: %s", async (file) => {
    await write(file, '{"changed":true}');
    commit("metadata change");
    expect(check().status).toBe(1);
  });

  it.each(["", "a".repeat(40), "not-a-commit"])(
    "builds without a valid deployment baseline: %s",
    async (previous) => {
      await write(`${cli}/tests/example.test.ts`, "test timeout");
      commit("test only");
      expect(check("content", previous).status).toBe(1);
    }
  );

  it("allows same-commit redeployments and force builds", async () => {
    expect(check().status).toBe(1);
    await write(`${cli}/tests/example.test.ts`, "test timeout");
    commit("test only");
    expect(check("content", base, "1").status).toBe(1);
  });

  it.each(["package.json", "turbo.json"])(
    "builds when task metadata is missing or invalid: %s",
    async (file) => {
      await write(`${cli}/tests/example.test.ts`, "test timeout");
      commit("test only");
      const target = `workspaces/content/tasks/${file}`;
      await rm(path.join(root, target));
      expect(check().status).toBe(1);
      await write(target, "{}");
      expect(check().status).toBe(1);
    }
  );

  it("builds when the constructor cannot account for externally owned sources", async () => {
    await write(
      "workspaces/content/tasks/package.json",
      JSON.stringify(workspaceTaskManifest("content", false))
    );
    base = commit("external selection");
    await write(`${cli}/tests/example.test.ts`, "test timeout");
    commit("test only");
    expect(check().status).toBe(1);
  });

  it("honors skip-ci unless explicitly forced", async () => {
    await write("apps/web/layout.tsx", "changed layout");
    commit("application change [skip ci]");
    expect(check().status).toBe(0);
    expect(check("content", base, "1").status).toBe(1);
  });

  it("builds if the task package is not registered in the outer workspace", async () => {
    await write(
      "pnpm-workspace.yaml",
      "packages:\n  - packages/*\n  - apps/*\n"
    );
    base = commit("omit task registration");
    await write(`${cli}/tests/example.test.ts`, "test timeout");
    commit("test only");
    expect(check().status).toBe(1);
  });
});
