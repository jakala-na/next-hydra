/* oxlint-disable vitest/max-expects -- Safety tests assert both rejection and preservation of user files. */
/* oxlint-disable unicorn/no-array-sort -- Only newly created arrays are sorted; the CLI targets ES2022. */
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { normalizePackageName, writeJsonFile } from "../src/fs-utils.js";
import { runGit } from "../src/git.js";
import {
  copyMaintainerEnvironmentFiles,
  copyMaintainerWorkspace,
  linkMaintainerWorkspaceSources,
  pruneUnselectedWorkspacePackages,
} from "../src/maintainer-workspace.js";
import {
  assertDistinctFileTargets,
  assertNewWorkspaceDirectory,
  createWorkspaceDirectory,
  workspaceSourceFiles,
} from "../src/workspace-files.js";

async function file(root: string, name: string, content = "fixture") {
  const destination = path.join(root, name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
  return destination;
}

describe("maintainer workspace safety", () => {
  let scratch: string;
  let source: string;
  let target: string;
  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "composition-safety-"));
    source = path.join(scratch, "source checkout");
    target = path.join(scratch, "output");
    await mkdir(source);
    await runGit(["init"], { cwd: source });
    await file(source, ".git/info/exclude", ".env*\nnode_modules/\n.next/\n");
  });
  afterEach(async () => {
    // Only this test's freshly allocated fixture. Never follows linked source directories.
    await rm(scratch, { force: true, recursive: true });
  });

  describe("fresh workspace boundaries", () => {
    it("rejects an existing empty directory", async () => {
      await mkdir(target);
      await expect(createWorkspaceDirectory(target)).rejects.toThrow(
        "Refusing to replace"
      );
      await expect(readdir(target)).resolves.toEqual([]);
    });

    it("detects a dangling destination symlink", async () => {
      await symlink(path.join(scratch, "missing"), target);
      await expect(assertNewWorkspaceDirectory(target)).rejects.toThrow(
        "Refusing to replace"
      );
      const destination = await lstat(target);
      expect(destination.isSymbolicLink()).toBeTruthy();
    });

    it("rejects a redirected parent before creating any subdirectories", async () => {
      await symlink(source, target);
      await expect(
        createWorkspaceDirectory(path.join(target, "nested/new"))
      ).rejects.toThrow("physical directory");
      await expect(readdir(source)).resolves.toEqual([".git"]);
    });

    it("does not create directories during preflight", async () => {
      await assertNewWorkspaceDirectory(path.join(target, "nested/new"));
      await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("grants only one invocation ownership of the output", async () => {
      const results = await Promise.allSettled([
        createWorkspaceDirectory(target),
        createWorkspaceDirectory(target),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([
        "fulfilled",
        "rejected",
      ]);
    });

    it.each([
      ["apps/web/config", "apps/web/config/index.ts"],
      ["apps/web/config/index.ts", "apps/web/config"],
      ["apps/web/env.ts", "apps/web/./env.ts"],
      ["../escape"],
      ["/absolute"],
      ["apps/web/\0invalid"],
    ])("rejects conflicting or unsafe targets: %j", (...targets) => {
      expect(() => {
        assertDistinctFileTargets(targets);
      }).toThrow(/composition|Composition/u);
    });

    it("accepts siblings with a common prefix", () => {
      expect(() => {
        assertDistinctFileTargets([
          "apps/web/config.ts",
          "apps/web/config/index.ts",
        ]);
      }).not.toThrow();
    });
  });

  describe("environment overlays", () => {
    it("copies only into selected directories, with private permissions", async () => {
      await file(source, "apps/web/.env.local", "DUMMY_VALUE=local");
      await file(source, "apps/api/.env.local", "DUMMY_VALUE=excluded");
      await mkdir(path.join(target, "apps/web"), { recursive: true });
      await expect(
        copyMaintainerEnvironmentFiles(source, target)
      ).resolves.toEqual(["apps/web/.env.local"]);
      await expect(
        readFile(path.join(target, "apps/web/.env.local"), "utf-8")
      ).resolves.toBe("DUMMY_VALUE=local");
      const copied = await lstat(path.join(target, "apps/web/.env.local"));
      // oxlint-disable-next-line no-bitwise -- Verify exact POSIX permissions on the new credential file.
      expect(copied.mode & 0o777).toBe(0o600);
      await expect(lstat(path.join(target, "apps/api"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("uses current-worktree values over primary-worktree values, including paths with spaces", async () => {
      const primary = source;
      await runGit(
        [
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "-c",
          "commit.gpgsign=false",
          "commit",
          "--allow-empty",
          "-m",
          "fixture",
        ],
        { cwd: primary }
      );
      source = path.join(scratch, "secondary checkout");
      await runGit(["worktree", "add", "--detach", source, "HEAD"], {
        cwd: primary,
      });
      await file(primary, "apps/web/.env.local", "DUMMY_VALUE=primary");
      await file(source, "apps/web/.env.local", "DUMMY_VALUE=current");
      await mkdir(path.join(target, "apps/web"), { recursive: true });
      await copyMaintainerEnvironmentFiles(source, target);
      await expect(
        readFile(path.join(target, "apps/web/.env.local"), "utf-8")
      ).resolves.toBe("DUMMY_VALUE=current");
    });

    it("rejects source symlinks without copying their contents", async () => {
      const outside = await file(scratch, "outside.env", "DUMMY_VALUE=outside");
      await mkdir(path.join(source, "apps/web"), { recursive: true });
      await mkdir(path.join(target, "apps/web"), { recursive: true });
      await symlink(outside, path.join(source, "apps/web/.env.local"));
      await expect(
        copyMaintainerEnvironmentFiles(source, target)
      ).rejects.toThrow("regular source files");
      await expect(readdir(path.join(target, "apps/web"))).resolves.toEqual([]);
    });

    it("rejects destination directory symlinks without touching canonical source", async () => {
      await file(source, "apps/web/.env.local", "DUMMY_VALUE=keep");
      await mkdir(path.join(target, "apps"), { recursive: true });
      await symlink(
        path.join(source, "apps/web"),
        path.join(target, "apps/web")
      );
      await expect(
        copyMaintainerEnvironmentFiles(source, target)
      ).rejects.toThrow("physical directory");
      await expect(
        readFile(path.join(source, "apps/web/.env.local"), "utf-8")
      ).resolves.toBe("DUMMY_VALUE=keep");
    });

    it.each(["file", "directory", "symlink"])(
      "preserves an existing destination %s and preflights the whole overlay",
      async (kind) => {
        await file(source, "apps/web/.env", "DUMMY_VALUE=new");
        await file(source, "apps/web/.env.local", "DUMMY_VALUE=new");
        const destination = path.join(target, "apps/web/.env.local");
        await mkdir(path.dirname(destination), { recursive: true });
        if (kind === "directory") {
          await mkdir(destination);
        } else if (kind === "symlink") {
          await symlink(path.join(scratch, "missing"), destination);
        } else {
          await writeFile(destination, "DUMMY_VALUE=keep");
        }
        const before = await lstat(destination);
        await expect(
          copyMaintainerEnvironmentFiles(source, target)
        ).rejects.toThrow("Refusing to replace an existing environment path");
        const after = await lstat(destination);
        expect(after.ino).toBe(before.ino);
        await expect(
          lstat(path.join(target, "apps/web/.env"))
        ).rejects.toMatchObject({ code: "ENOENT" });
      }
    );

    it("excludes example files and dependency/build output environments", async () => {
      const excluded = [
        "apps/web/.env.example",
        "apps/web/node_modules/demo/.env",
        "apps/web/.next/.env",
      ];
      await Promise.all(
        excluded.map(async (name) => {
          await file(source, name);
          await mkdir(path.dirname(path.join(target, name)), {
            recursive: true,
          });
        })
      );
      await expect(
        copyMaintainerEnvironmentFiles(source, target)
      ).resolves.toEqual([]);
    });

    it("keeps a package physical when it contains an environment overlay", async () => {
      await file(source, "registry.json", '{"items":[]}');
      await file(source, "packages/demo/package.json", '{"name":"@repo/demo"}');
      await file(target, "packages/demo/package.json", '{"name":"@repo/demo"}');
      await file(target, "packages/demo/.env.local", "DUMMY_VALUE=isolated");
      await linkMaintainerWorkspaceSources({
        environmentFiles: ["packages/demo/.env.local"],
        selectedItems: [],
        selection: { addOns: [], providers: {} },
        sourceRoot: source,
        targetRoot: target,
      });
      const packageDirectory = await lstat(path.join(target, "packages/demo"));
      expect(packageDirectory.isSymbolicLink()).toBeFalsy();
      await expect(
        readFile(path.join(target, "packages/demo/.env.local"), "utf-8")
      ).resolves.toBe("DUMMY_VALUE=isolated");
    });
  });

  describe("canonical inventories and naming", () => {
    it("does not remove a materialized file when its canonical link source is missing", async () => {
      await file(
        source,
        "registry.json",
        JSON.stringify({
          items: [
            {
              files: [
                {
                  path: "missing.ts",
                  target: "~/apps/web/app/api/example/route.ts",
                },
              ],
              name: "route",
            },
          ],
        })
      );
      const route = await file(
        target,
        "apps/web/app/api/example/route.ts",
        "keep this source"
      );
      await expect(
        linkMaintainerWorkspaceSources({
          selectedItems: ["route"],
          selection: { addOns: [], providers: {} },
          sourceRoot: source,
          targetRoot: target,
        })
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(route, "utf-8")).resolves.toBe("keep this source");
    });

    it("retains new files but excludes working-tree deletions", async () => {
      await file(source, "kept.ts");
      const deleted = await file(source, "deleted.ts");
      await runGit(["add", "kept.ts", "deleted.ts"], { cwd: source });
      await rm(deleted);
      await file(source, "new.ts");
      await expect(workspaceSourceFiles(source)).resolves.toEqual([
        "kept.ts",
        "new.ts",
      ]);
      await copyMaintainerWorkspace(source, target);
      const entries = await readdir(target);
      expect(entries.sort()).toEqual(["kept.ts", "new.ts"]);
    });

    it("retains workspace peers when pruning unselected applications", async () => {
      await file(
        target,
        "registry.json",
        '{"items":[{"name":"app-web","files":[{"path":"apps/web/package.json","target":"~/apps/web/package.json"}]}]}'
      );
      await file(target, "package.json", "{}");
      await file(
        target,
        "apps/web/package.json",
        '{"dependencies":{"@repo/core":"workspace:*"}}'
      );
      await file(
        target,
        "packages/core/package.json",
        '{"name":"@repo/core","peerDependencies":{"@repo/peer":"workspace:*"}}'
      );
      await file(target, "packages/peer/package.json", '{"name":"@repo/peer"}');
      await writeJsonFile(path.join(target, "packages/core/tsconfig.json"), {});
      await expect(
        pruneUnselectedWorkspacePackages({
          selectedItems: ["app-web"],
          sourceRoot: target,
          targetRoot: target,
        })
      ).resolves.toEqual([]);
    });

    it("uses a product-neutral fallback application name", () => {
      expect(normalizePackageName("---")).toBe("application");
    });
  });
});
