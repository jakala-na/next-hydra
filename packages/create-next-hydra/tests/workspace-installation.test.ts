import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCommand } from "../src/git.js";
import { updateWorkspaceFiles } from "../src/workspace-update.js";
import type { WorkspaceFile } from "../src/workspace-update.js";

function file(target: string, content: string) {
  return {
    content: Buffer.from(content),
    mode: 0o644,
    owner: "fixture",
    target,
  };
}

async function install(cwd: string): Promise<void> {
  await runCommand("pnpm", ["install", "--offline", "--no-frozen-lockfile"], {
    cwd,
  });
}

describe("workspace installation", () => {
  let scratch: string;
  let target: string;
  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "workspace-installation-"));
    target = path.join(scratch, "workspaces/site");
    await mkdir(target, { recursive: true });
  });
  afterEach(async () => {
    await rm(scratch, { force: true, recursive: true });
  });

  async function refresh(
    files: WorkspaceFile[],
    installDependencies?: (cwd: string) => Promise<void>
  ) {
    return await updateWorkspaceFiles({
      dependencyDirectories: ["."],
      dependencyHash: "fixture",
      files,
      install: installDependencies,
      rejectUnowned: true,
      sourceRoot: scratch,
      targetRoot: target,
    });
  }

  it("keeps pnpm's normalized lockfile and restored caches without reinstalling unchanged dependencies", async () => {
    await mkdir(path.join(target, "node_modules/.cache/turbo"), {
      recursive: true,
    });
    await writeFile(
      path.join(target, "node_modules/.cache/turbo/sentinel"),
      "keep"
    );
    const files = [
      file(
        "package.json",
        JSON.stringify({
          name: "site",
          packageManager: "pnpm@10.11.0",
          private: true,
          scripts: {
            preinstall: `node -e "require('node:fs').appendFileSync('node_modules/.cache/install-count', 'x')"`,
          },
        })
      ),
      file("pnpm-workspace.yaml", "packages:\n  - apps/*\n"),
      file("pnpm-lock.yaml", "lockfileVersion: '9.0'\nimporters:\n  .: {}\n"),
    ];
    await refresh(files, install);
    const lockfile = await readFile(
      path.join(target, "pnpm-lock.yaml"),
      "utf-8"
    );
    const result = await refresh(files, install);
    expect({
      cache: await readFile(
        path.join(target, "node_modules/.cache/turbo/sentinel"),
        "utf-8"
      ),
      installs: await readFile(
        path.join(target, "node_modules/.cache/install-count"),
        "utf-8"
      ),
      lockfile: await readFile(path.join(target, "pnpm-lock.yaml"), "utf-8"),
      result,
    }).toMatchObject({
      cache: "keep",
      installs: "x",
      lockfile,
      result: { changed: 0, needsInstall: false },
    });
  }, 30_000);
});
