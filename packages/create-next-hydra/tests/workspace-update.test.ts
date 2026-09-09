/* oxlint-disable vitest/max-expects -- Verify updates and preservation at the filesystem boundary together. */
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  discoverDevelopmentWorkspaces,
  workspaceDefinitionSchema,
} from "../src/development-workspaces.js";
import { runGit } from "../src/git.js";
import {
  hashWorkspaceContent,
  copiedWorkspaceSources,
  updateWorkspaceFiles,
  WORKSPACE_STATE,
} from "../src/workspace-update.js";
import type { WorkspaceFile } from "../src/workspace-update.js";

let root: string;
let sourceRoot: string;
let targetRoot: string;
const file = (target: string, content: string): WorkspaceFile => ({
  content: Buffer.from(content),
  mode: 0o644,
  owner: "fixture",
  target,
});
const update = async (
  files: WorkspaceFile[],
  options: Partial<Parameters<typeof updateWorkspaceFiles>[0]> = {}
) =>
  await updateWorkspaceFiles({
    dependencyHash: "dependencies-v1",
    files,
    sourceRoot,
    targetRoot,
    ...options,
  });

describe("development workspace lifecycle", () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "workspace-update-"));
    sourceRoot = path.join(root, "source");
    targetRoot = path.join(root, "workspace");
    await mkdir(sourceRoot);
    await mkdir(targetRoot);
  });
  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  describe("safe workspace refresh", () => {
    it("adds provenance to an existing v2 state without rewriting output or reinstalling", async () => {
      const target = "apps/web/layout.tsx";
      const install = vi.fn<() => Promise<void>>(async () => {
        await mkdir(path.join(targetRoot, "node_modules"), { recursive: true });
      });
      await update([file(target, "layout")], { install });
      const origin = {
        kind: "template",
        path: "apps/web/registry/templates/layout.tsx.template",
      } as const;
      const result = await update([{ ...file(target, "layout"), origin }], {
        install,
      });
      expect(result).toMatchObject({
        changed: 0,
        needsInstall: false,
        removed: 0,
      });
      expect(install).toHaveBeenCalledOnce();
      const state = z
        .object({
          files: z.array(
            z.object({
              origin: z
                .object({ kind: z.string(), path: z.string() })
                .optional(),
              target: z.string(),
            })
          ),
        })
        .parse(
          JSON.parse(
            await readFile(path.join(targetRoot, WORKSPACE_STATE), "utf-8")
          )
        );
      expect(state.files[0]).toMatchObject({ origin, target });
      await expect(copiedWorkspaceSources(targetRoot)).resolves.toEqual([
        origin.path,
      ]);
      await writeFile(path.join(targetRoot, target), "local edit");
      await expect(
        update([{ ...file(target, "new layout"), origin }])
      ).rejects.toThrow(path.join(sourceRoot, origin.path));
      await expect(
        readFile(path.join(targetRoot, target), "utf-8")
      ).resolves.toBe("local edit");
    });

    it("initializes, refreshes a template and is idempotent without reinstalling", async () => {
      const install = vi.fn<() => Promise<void>>(async () => {
        await mkdir(path.join(targetRoot, "node_modules"), { recursive: true });
      });
      await update([file("apps/web/layout.tsx", "first")], { install });
      const second = await update([file("apps/web/layout.tsx", "second")], {
        install,
      });
      const third = await update([file("apps/web/layout.tsx", "second")], {
        install,
      });
      expect(second).toMatchObject({
        changed: 1,
        needsInstall: false,
        removed: 0,
      });
      expect(third).toMatchObject({
        changed: 0,
        needsInstall: false,
        removed: 0,
      });
      expect(install).toHaveBeenCalledOnce();
      await expect(
        readFile(path.join(targetRoot, "apps/web/layout.tsx"), "utf-8")
      ).resolves.toBe("second");
    });

    it("leaves dependency installation pending and retries a failed install", async () => {
      const files = [
        file("package.json", "{}"),
        file("pnpm-lock.yaml", "seed"),
      ];
      await expect(update(files)).resolves.toMatchObject({
        needsInstall: true,
      });
      await expect(
        update(files, {
          install: async () => {
            await writeFile(
              path.join(targetRoot, "pnpm-lock.yaml"),
              "partly normalized"
            );
            throw new Error("network unavailable");
          },
        })
      ).rejects.toThrow("network unavailable");
      const install = vi.fn<() => Promise<void>>(async () => {
        await mkdir(path.join(targetRoot, "node_modules"));
      });
      await expect(update(files, { install })).resolves.toMatchObject({
        needsInstall: false,
      });
      await expect(update(files, { install })).resolves.toMatchObject({
        changed: 0,
      });
      await expect(
        readFile(path.join(targetRoot, "pnpm-lock.yaml"), "utf-8")
      ).resolves.toBe("partly normalized");
      expect(install).toHaveBeenCalledOnce();
    });

    it("installs changed dependency inputs and detects missing dependencies", async () => {
      const install = vi.fn<() => Promise<void>>(async () => {
        await mkdir(path.join(targetRoot, "node_modules"), { recursive: true });
      });
      await update([file("package.json", "{}")], { install });
      await update([file("package.json", "{}")], {
        dependencyHash: "v2",
        install,
      });
      await rm(path.join(targetRoot, "node_modules"), { recursive: true });
      await update([file("package.json", "{}")], {
        dependencyHash: "v2",
        install,
      });
      expect(install).toHaveBeenCalledTimes(3);
    });

    it("detects missing package dependencies even when root dependencies exist", async () => {
      const files = [file("apps/web/package.json", "{}")];
      await update(files, {
        install: async () => {
          await mkdir(path.join(targetRoot, "node_modules"));
        },
      });
      await expect(
        update(files, { check: true, dependencyDirectories: [".", "apps/web"] })
      ).resolves.toMatchObject({ needsInstall: true });
    });

    it("refuses dependency installation through symlinked node_modules", async () => {
      await symlink(sourceRoot, path.join(targetRoot, "node_modules"));
      const install = vi.fn<() => Promise<void>>();
      await expect(
        update([file("package.json", "{}")], { install })
      ).rejects.toThrow("physical directory");
      expect(install).not.toHaveBeenCalled();
    });

    it("edits canonical source through links and only unlinks when removing a provider", async () => {
      const source = path.join(sourceRoot, "route.ts");
      await writeFile(source, "original");
      await update([
        { owner: "cms", source, target: "apps/web/api/revalidate/route.ts" },
      ]);
      await writeFile(
        path.join(targetRoot, "apps/web/api/revalidate/route.ts"),
        "edited source"
      );
      await expect(update([], { check: true })).resolves.toMatchObject({
        removed: 1,
      });
      await update([]);
      await expect(readFile(source, "utf-8")).resolves.toBe("edited source");
      await expect(
        lstat(path.join(targetRoot, "apps/web/api/revalidate/route.ts")).catch(
          () => undefined
        )
      ).resolves.toBeUndefined();
    });

    it("replaces a provider link at the same route without changing either source", async () => {
      const first = path.join(sourceRoot, "first.ts");
      const second = path.join(sourceRoot, "second.ts");
      await writeFile(first, "first");
      await writeFile(second, "second");
      await update([{ owner: "first", source: first, target: "route.ts" }]);
      await update([{ owner: "second", source: second, target: "route.ts" }]);
      expect(
        path.resolve(
          targetRoot,
          await readlink(path.join(targetRoot, "route.ts"))
        )
      ).toBe(second);
      await expect(readFile(first, "utf-8")).resolves.toBe("first");
    });

    it.each(["edit", "delete", "redirect"])(
      "blocks a local %s before applying any other changes",
      async (change) => {
        await update([file("a.ts", "a"), file("b.ts", "b")]);
        const target = path.join(targetRoot, "b.ts");
        if (change === "edit") {
          await writeFile(target, "local");
        } else {
          await unlink(target);
          if (change === "redirect") {
            await symlink(path.join(sourceRoot, "unrelated"), target);
          }
        }
        await expect(
          update([file("a.ts", "new"), file("b.ts", "new")])
        ).rejects.toThrow("no application files changed");
        await expect(
          readFile(path.join(targetRoot, "a.ts"), "utf-8")
        ).resolves.toBe("a");
        const status = await update([], { check: true });
        expect(status.conflicts).toHaveLength(change === "delete" ? 0 : 1);
      }
    );

    it("reports and preserves unregistered files, including inside an unselected package", async () => {
      await update([file("packages/cms/old.ts", "owned")]);
      await writeFile(
        path.join(targetRoot, "packages/cms/new.ts"),
        "unregistered"
      );
      const result = await update([]);
      expect(result.unowned).toEqual(["packages/cms/new.ts"]);
      await expect(
        readFile(path.join(targetRoot, "packages/cms/new.ts"), "utf-8")
      ).resolves.toBe("unregistered");
      await expect(
        update([file("packages/cms/new.ts", "registered")])
      ).rejects.toThrow("unowned existing file");
    });

    it("does not follow symlinked parent directories", async () => {
      await symlink(sourceRoot, path.join(targetRoot, "apps"));
      await expect(update([file("apps/layout.tsx", "bad")])).rejects.toThrow(
        "physical directory"
      );
      await expect(
        lstat(path.join(sourceRoot, "layout.tsx")).catch(() => undefined)
      ).resolves.toBeUndefined();
    });

    it("check makes no output changes and skips generated caches and credentials", async () => {
      await mkdir(path.join(targetRoot, "node_modules"));
      await writeFile(
        path.join(targetRoot, "node_modules", "runtime"),
        "ignored"
      );
      await writeFile(path.join(targetRoot, ".env.local"), "secret");
      await writeFile(
        path.join(targetRoot, "next-env.d.ts"),
        "generated by Next"
      );
      await mkdir(
        path.join(targetRoot, "apps/api/app/.well-known/workflow/v1"),
        { recursive: true }
      );
      await writeFile(
        path.join(
          targetRoot,
          "apps/api/app/.well-known/workflow/v1/manifest.json"
        ),
        "{}"
      );
      const result = await update([file("layout.tsx", "planned")], {
        check: true,
      });
      expect(result).toMatchObject({ changed: 1, unowned: [] });
      await expect(
        lstat(path.join(targetRoot, WORKSPACE_STATE)).catch(() => undefined)
      ).resolves.toBeUndefined();
      await expect(
        lstat(path.join(targetRoot, "layout.tsx")).catch(() => undefined)
      ).resolves.toBeUndefined();
    });

    it.each([
      "../outside",
      "./next-hydra.json",
      "next-hydra.json",
      ".env.local",
      "node_modules/file",
      "a/../../outside",
    ])("rejects protected or escaping target %s", async (target) => {
      await expect(update([file(target, "bad")])).rejects.toThrow(
        /workspace|protected/iu
      );
    });

    it("refuses legacy receipts without hashes instead of claiming their files", async () => {
      await writeFile(
        path.join(targetRoot, WORKSPACE_STATE),
        '{"version":1,"files":[]}'
      );
      await expect(update([file("layout.tsx", "new")])).rejects.toThrow(
        "Legacy receipts cannot be auto-adopted"
      );
    });

    it("recovers an interrupted file update using exact before/after fingerprints", async () => {
      await update([file("a.ts", "before"), file("b.ts", "before")]);
      const state = z
        .object({
          files: z.array(
            z
              .object({
                applied: z.object({ hash: z.string() }).passthrough(),
                desired: z.object({ hash: z.string() }).passthrough(),
              })
              .passthrough()
          ),
        })
        .passthrough()
        .parse(
          JSON.parse(
            await readFile(path.join(targetRoot, WORKSPACE_STATE), "utf-8")
          )
        );
      const pending = structuredClone(state);
      for (const entry of pending.files) {
        entry.applied.hash = hashWorkspaceContent("after");
        entry.desired.hash = entry.applied.hash;
      }
      await writeFile(
        path.join(targetRoot, WORKSPACE_STATE),
        JSON.stringify({ ...state, pending })
      );
      await writeFile(path.join(targetRoot, "a.ts"), "after");
      await update([file("a.ts", "latest"), file("b.ts", "latest")]);
      await expect(
        readFile(path.join(targetRoot, "a.ts"), "utf-8")
      ).resolves.toBe("latest");
      await expect(
        readFile(path.join(targetRoot, "b.ts"), "utf-8")
      ).resolves.toBe("latest");
      expect(
        JSON.parse(
          await readFile(path.join(targetRoot, WORKSPACE_STATE), "utf-8")
        )
      ).not.toHaveProperty("pending");
    });
  });

  describe("named definitions", () => {
    it("rejects the removed app-profile selector", () => {
      expect(() =>
        workspaceDefinitionSchema.parse({
          apps: { web: "app-web" },
          providers: { cms: "drupal" },
        })
      ).toThrow("Unrecognized key");
      expect(
        workspaceDefinitionSchema.parse({ providers: { cms: "drupal" } })
      ).toEqual({ addOns: [], providers: { cms: "drupal" } });
    });

    it("discovers only direct named definitions, not nested scratch output or links", async () => {
      await runGit(["init"], { cwd: sourceRoot });
      const folder = path.join(sourceRoot, "workspaces");
      await mkdir(path.join(folder, "cms-drupal"), { recursive: true });
      await writeFile(path.join(folder, "cms-drupal/next-hydra.json"), "{}");
      await mkdir(path.join(folder, "scratch/nested"), { recursive: true });
      await writeFile(
        path.join(folder, "scratch/nested/next-hydra.json"),
        "{}"
      );
      await symlink(
        path.join(folder, "cms-drupal"),
        path.join(folder, "linked")
      );
      await mkdir(path.join(folder, "legacy"));
      await writeFile(path.join(folder, "legacy/next-hydra.json"), "{}");
      await writeFile(
        path.join(sourceRoot, ".gitignore"),
        "workspaces/legacy/\n"
      );
      await expect(discoverDevelopmentWorkspaces(sourceRoot)).resolves.toEqual([
        "cms-drupal",
      ]);
    });
  });
});
