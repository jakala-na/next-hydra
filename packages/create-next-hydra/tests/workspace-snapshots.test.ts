import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runGit } from "../src/git.js";
import { workspaceSnapshotDirectory } from "../src/workspace-snapshots.js";
import {
  inspectWorkspaceChanges,
  updateWorkspaceFiles,
  WORKSPACE_STATE,
} from "../src/workspace-update.js";
import type { WorkspaceFile } from "../src/workspace-update.js";

let root: string;
let sourceRoot: string;
let targetRoot: string;

function source(target: string, content: string): WorkspaceFile {
  return {
    content: Buffer.from(content),
    mode: 0o644,
    origin: { kind: "source", path: target },
    owner: "example",
    target,
  };
}

async function update(
  files: WorkspaceFile[],
  options: Partial<Parameters<typeof updateWorkspaceFiles>[0]> = {}
) {
  return await updateWorkspaceFiles({
    dependencyHash: "initial",
    files,
    preservedFiles: [".gitignore"],
    rejectUnowned: true,
    snapshot: true,
    sourceRoot,
    targetRoot,
    ...options,
  });
}

async function savedSnapshot() {
  const result = await runGit([
    `--git-dir=${workspaceSnapshotDirectory(sourceRoot, targetRoot)}`,
    "rev-parse",
    "refs/heads/composition",
  ]);
  return result.stdout.trim();
}

describe("private composition snapshots", () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "workspace-snapshots-"));
    sourceRoot = path.join(root, "source");
    targetRoot = path.join(sourceRoot, "workspaces", "example");
    await mkdir(targetRoot, { recursive: true });
    await writeFile(path.join(targetRoot, ".gitignore"), "*\n");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { force: true, recursive: true });
  });

  it("reports real edits, deletions and ignored new files with their source owners", async () => {
    await update([
      source("apps/web/menu.ts", "export const title = 'Before';\n"),
      source("apps/web/removed.ts", "export const old = true;\n"),
      {
        ...source("apps/web/layout.tsx", "export default 'layout';\n"),
        origin: {
          kind: "template",
          path: "apps/web/registry/layout.tsx.template",
        },
      },
    ]);
    const clean = await inspectWorkspaceChanges(sourceRoot, targetRoot);
    expect(clean.patch).toBe("");
    await writeFile(
      path.join(targetRoot, "apps/web/menu.ts"),
      "export const title = 'After';\n"
    );
    await unlink(path.join(targetRoot, "apps/web/removed.ts"));
    await writeFile(path.join(targetRoot, "apps/web/new.ts"), "new work\n");
    const result = await inspectWorkspaceChanges(sourceRoot, targetRoot);
    expect(result.files).toEqual([
      {
        origin: {
          kind: "template",
          path: "apps/web/registry/layout.tsx.template",
        },
        owner: "example",
        status: "unchanged",
        target: "apps/web/layout.tsx",
      },
      {
        origin: { kind: "source", path: "apps/web/menu.ts" },
        owner: "example",
        status: "modified",
        target: "apps/web/menu.ts",
      },
      {
        origin: undefined,
        owner: undefined,
        status: "unregistered",
        target: "apps/web/new.ts",
      },
      {
        origin: { kind: "source", path: "apps/web/removed.ts" },
        owner: "example",
        status: "deleted",
        target: "apps/web/removed.ts",
      },
    ]);
    expect(result.patch).toContain("-export const title = 'Before';");
    expect(result.patch).toContain("+export const title = 'After';");
  });

  it("does not put credentials or build output into snapshots or diff output", async () => {
    await update([
      source("apps/web/page.ts", "application"),
      source("apps/web/private.pem", "private certificate"),
    ]);
    await mkdir(path.join(targetRoot, "apps/web/.next"));
    await writeFile(
      path.join(targetRoot, "apps/web/.next/output.js"),
      "build output"
    );
    await writeFile(
      path.join(targetRoot, "apps/web/.env.local"),
      "SECRET=changed-secret"
    );
    const result = await inspectWorkspaceChanges(sourceRoot, targetRoot);
    const tracked = await runGit([
      `--git-dir=${workspaceSnapshotDirectory(sourceRoot, targetRoot)}`,
      "ls-tree",
      "-r",
      "--name-only",
      "refs/heads/composition",
    ]);
    expect(tracked.stdout.trim().split("\n")).toEqual(["apps/web/page.ts"]);
    expect(result.files.map((file) => file.target)).toEqual([
      "apps/web/page.ts",
    ]);
    expect(result.patch).toBe("");
  });

  it("preserves the snapshot and local edits when refresh fails", async () => {
    const files = [source("page.ts", "before")];
    await update(files);
    const original = await savedSnapshot();
    await writeFile(path.join(targetRoot, "page.ts"), "uncommitted work");
    await expect(update([source("page.ts", "upstream")])).rejects.toThrow(
      "locally modified"
    );
    await expect(savedSnapshot()).resolves.toBe(original);
    const result = await inspectWorkspaceChanges(sourceRoot, targetRoot);
    expect(result.patch).toContain("+uncommitted work");
  });

  it("leaves the saved snapshot and ownership state unchanged during inspection", async () => {
    await update([source("page.ts", "before")]);
    const original = await savedSnapshot();
    const metadata = await readFile(path.join(targetRoot, WORKSPACE_STATE));
    await writeFile(path.join(targetRoot, "page.ts"), "local edit");
    await inspectWorkspaceChanges(sourceRoot, targetRoot);
    await expect(savedSnapshot()).resolves.toBe(original);
    await expect(
      readFile(path.join(targetRoot, WORKSPACE_STATE))
    ).resolves.toEqual(metadata);
    await expect(
      readFile(path.join(targetRoot, "page.ts"), "utf-8")
    ).resolves.toBe("local edit");
  });

  it("advances after a clean refresh, keeps previous contents, and avoids empty commits", async () => {
    await update([source("page.ts", "before\n")]);
    const original = await savedSnapshot();
    await update([source("page.ts", "before\n")]);
    await expect(savedSnapshot()).resolves.toBe(original);
    await update([source("page.ts", "after\n")]);
    const contents = await runGit([
      `--git-dir=${workspaceSnapshotDirectory(sourceRoot, targetRoot)}`,
      "show",
      `${original}:page.ts`,
    ]);
    expect(contents.stdout).toBe("before\n");
    await expect(
      inspectWorkspaceChanges(sourceRoot, targetRoot)
    ).resolves.toMatchObject({ patch: "" });
  });

  it("isolates the maintainer index even when Git environment paths are inherited", async () => {
    await runGit(["init", "--quiet"], { cwd: sourceRoot });
    await writeFile(path.join(sourceRoot, "canonical.ts"), "source");
    await runGit(["add", "canonical.ts"], { cwd: sourceRoot });
    const index = path.join(sourceRoot, ".git/index");
    const before = await readFile(index);
    vi.stubEnv("GIT_INDEX_FILE", index);
    vi.stubEnv("GIT_DIR", path.join(sourceRoot, ".git"));
    vi.stubEnv("GIT_WORK_TREE", sourceRoot);
    await update([source("page.ts", "application")]);
    await inspectWorkspaceChanges(sourceRoot, targetRoot);
    await expect(readFile(index)).resolves.toEqual(before);
    await expect(lstat(path.join(targetRoot, ".git"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("never adopts existing edited output when adding snapshots to older state", async () => {
    await update([source("page.ts", "before")], { snapshot: false });
    await writeFile(path.join(targetRoot, "page.ts"), "local work");
    await expect(update([source("page.ts", "before")])).rejects.toThrow(
      "locally modified"
    );
    await expect(
      inspectWorkspaceChanges(sourceRoot, targetRoot)
    ).rejects.toThrow("No composition snapshot");
    await writeFile(path.join(targetRoot, "page.ts"), "before");
    await update([source("page.ts", "before")]);
    await expect(
      inspectWorkspaceChanges(sourceRoot, targetRoot)
    ).resolves.toMatchObject({ patch: "" });
  });

  it("protects a source file changed by installation from becoming the new snapshot", async () => {
    await update([source("page.ts", "before")]);
    const original = await savedSnapshot();
    await expect(
      update([source("page.ts", "after")], {
        install: async () => {
          await writeFile(path.join(targetRoot, "page.ts"), "concurrent edit");
        },
      })
    ).rejects.toThrow("File changed before its composition snapshot");
    await expect(savedSnapshot()).resolves.toBe(original);
  });

  it("refuses redirected directories without reading or changing their contents", async () => {
    await update([source("apps/web/page.ts", "before")]);
    const original = await readFile(path.join(targetRoot, WORKSPACE_STATE));
    const outside = path.join(root, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "page.ts"), "private contents");
    await rm(path.join(targetRoot, "apps/web"), { recursive: true });
    await symlink(outside, path.join(targetRoot, "apps/web"));
    await expect(
      inspectWorkspaceChanges(sourceRoot, targetRoot)
    ).rejects.toThrow("Expected a physical directory");
    await expect(
      readFile(path.join(targetRoot, WORKSPACE_STATE))
    ).resolves.toEqual(original);
  });

  it("keeps byte-accurate history despite application attributes and literal route names", async () => {
    const target = "apps/web/[locale]/page [draft].tsx";
    const before = "export default 'before';\r\n";
    await update([
      source(".gitattributes", "* text eol=lf -diff\n"),
      source(target, before),
    ]);
    const contents = await runGit([
      `--git-dir=${workspaceSnapshotDirectory(sourceRoot, targetRoot)}`,
      "show",
      `refs/heads/composition:${target}`,
    ]);
    expect(contents.stdout).toBe(before);
    await writeFile(
      path.join(targetRoot, target),
      "export default 'after';\r\n"
    );
    const result = await inspectWorkspaceChanges(sourceRoot, targetRoot);
    expect(result.files).toContainEqual(
      expect.objectContaining({ status: "modified", target })
    );
    expect(result.patch).toContain("+export default 'after';");
  });

  it("rebuilds a cleared snapshot cache only from unchanged owned output", async () => {
    const files = [source("page.ts", "before")];
    await update(files);
    await rm(workspaceSnapshotDirectory(sourceRoot, targetRoot), {
      force: true,
      recursive: true,
    });
    await writeFile(path.join(targetRoot, "page.ts"), "local edit");
    await expect(update(files)).rejects.toThrow("locally modified");
    await writeFile(path.join(targetRoot, "page.ts"), "before");
    await update(files);
    await expect(
      inspectWorkspaceChanges(sourceRoot, targetRoot)
    ).resolves.toMatchObject({ patch: "" });
  });

  it("does not advance the snapshot when dependency installation fails", async () => {
    await update([source("page.ts", "before")]);
    const original = await savedSnapshot();
    await expect(
      update([source("page.ts", "after")], {
        install: vi
          .fn<() => Promise<void>>()
          .mockRejectedValue(new Error("Installation failed")),
      })
    ).rejects.toThrow("Installation failed");
    await expect(savedSnapshot()).resolves.toBe(original);
    const result = await inspectWorkspaceChanges(sourceRoot, targetRoot);
    expect(result.patch).toContain("+after");
  });
});
