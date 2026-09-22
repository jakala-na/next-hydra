import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { composeWorkspace } from "../src/compose.js";
import {
  explainDevelopmentWorkspace,
  updateDevelopmentWorkspace,
  workspaceDefinitionSchema,
} from "../src/development-workspaces.js";
import { runGit } from "../src/git.js";
import { workspaceSnapshotDirectory } from "../src/workspace-snapshots.js";
import {
  inspectWorkspaceChanges,
  updateWorkspaceFiles,
} from "../src/workspace-update.js";
import { seedLinkedWorkspace } from "./fixtures/legacy-workspace.js";

const sourceRoot = path.resolve(import.meta.dirname, "../../..");

describe("named workspace deployment", () => {
  let name: string;
  let target: string;
  let scratch: string;
  beforeEach(async () => {
    name = `workspace-test-${randomUUID()}`;
    target = path.join(sourceRoot, "workspaces", name);
    scratch = await mkdtemp(path.join(tmpdir(), "workspace-deployment-"));
    await mkdir(target);
    await writeFile(
      path.join(target, "next-hydra.json"),
      JSON.stringify({ providers: { cms: "contentstack" } })
    );
  });
  afterEach(async () => {
    await rm(target, { force: true, recursive: true });
    await rm(workspaceSnapshotDirectory(sourceRoot, target), {
      force: true,
      recursive: true,
    });
    await rm(scratch, { force: true, recursive: true });
  });

  async function write(targetPath: string, content: string) {
    const absolute = path.join(target, targetPath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }

  it("seeds workspace-local Git policy without hiding its definition", async () => {
    const before = await runGit(
      ["ls-files", "--others", "--exclude-standard", "--", "."],
      { cwd: target }
    );
    expect(before.stdout.trim()).toBe("next-hydra.json");
    await updateDevelopmentWorkspace(sourceRoot, name, {
      check: true,
      install: false,
    });
    await expect(lstat(path.join(target, ".gitignore"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    await updateDevelopmentWorkspace(sourceRoot, name, {
      install: false,
    });
    const visible = await runGit(
      ["ls-files", "--others", "--exclude-standard", "--", "."],
      { cwd: target }
    );
    expect(visible.stdout.trim().split("\n")).toEqual([
      ".gitignore",
      "next-hydra.json",
    ]);

    await unlink(path.join(target, ".gitignore"));
    const check = await updateDevelopmentWorkspace(sourceRoot, name, {
      check: true,
      install: false,
    });
    expect(check.changed).toBe(1);
    await expect(lstat(path.join(target, ".gitignore"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  }, 30_000);

  it("keeps an empty author-owned ignore file empty", async () => {
    await write(".gitignore", "");
    await updateDevelopmentWorkspace(sourceRoot, name, { install: false });
    await expect(
      readFile(path.join(target, ".gitignore"), "utf-8")
    ).resolves.toBe("");
    const visible = await runGit(
      ["ls-files", "--others", "--exclude-standard", "--", "package.json"],
      { cwd: target }
    );
    expect(visible.stdout.trim()).toBe("package.json");
  }, 30_000);

  it.each([false, true])(
    "preserves app-local ignore settings during copied composition with initialized=%s",
    async (initialized) => {
      if (initialized) {
        await updateDevelopmentWorkspace(sourceRoot, name, { install: false });
      }
      // Tool-created ignore settings do not require the app to remain selected.
      const settings = "apps/api/.gitignore";
      const content = "/.swc\n# Keep local ignore rules\n";
      await write(settings, content);
      await updateDevelopmentWorkspace(sourceRoot, name, {
        install: false,
      });
      await expect(
        readFile(path.join(target, settings), "utf-8")
      ).resolves.toBe(content);
      const changes = await inspectWorkspaceChanges(sourceRoot, target);
      expect(
        changes.files.filter((file) => file.status !== "unchanged")
      ).toEqual([]);
      const visible = await runGit(
        ["ls-files", "--others", "--exclude-standard", "--", settings],
        { cwd: target }
      );
      expect(visible.stdout.trim()).toBe(settings);
      await expect(
        explainDevelopmentWorkspace(sourceRoot, name, settings)
      ).resolves.toContain("workspace-owned Git visibility configuration");
      await write("apps/api/unregistered.ts", "local work");
      await expect(
        updateDevelopmentWorkspace(sourceRoot, name, {
          install: false,
        })
      ).rejects.toThrow("apps/api/unregistered.ts");
    },
    30_000
  );

  it.each([
    {
      content: "// Local work to reconcile\n",
      error: /blocked by unregistered files/u,
      file: "draft.ts",
      reason: "unregistered files",
    },
    {
      content: "{}\n",
      error: /locally modified or deleted/u,
      file: "turbo.json",
      reason: "local edits",
    },
    {
      content: "{}\n",
      error: /Unsupported or invalid workspace state/u,
      file: ".workspace-composition.json",
      reason: "invalid ownership state",
    },
  ])(
    "preserves Git visibility when refresh rejects $reason",
    async ({ file, content, error }) => {
      await updateDevelopmentWorkspace(sourceRoot, name, {
        install: false,
      });
      await unlink(path.join(target, ".gitignore"));
      await write(file, content);
      const before = await runGit(
        ["ls-files", "--others", "--exclude-standard", "--", "."],
        { cwd: target }
      );

      await expect(
        updateDevelopmentWorkspace(sourceRoot, name, {
          install: false,
        })
      ).rejects.toThrow(error);

      await expect(
        lstat(path.join(target, ".gitignore"))
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(path.join(target, file), "utf-8")).resolves.toBe(
        content
      );
      const after = await runGit(
        ["ls-files", "--others", "--exclude-standard", "--", "."],
        { cwd: target }
      );
      expect(after.stdout).toBe(before.stdout);
    },
    30_000
  );

  it.each([
    "cms-contentstack",
    "cms-drupal",
    "storefront-contentstack",
    "storefront-drupal",
  ])(
    "initializes %s around deployment settings and restored caches using customer task configuration",
    async (definitionName) => {
      const definition = workspaceDefinitionSchema.parse(
        JSON.parse(
          await readFile(
            path.join(
              sourceRoot,
              "workspaces",
              definitionName,
              "next-hydra.json"
            ),
            "utf-8"
          )
        )
      );
      await write("next-hydra.json", JSON.stringify(definition));
      const ignoreRules = await readFile(
        path.join(sourceRoot, "workspaces", definitionName, ".gitignore"),
        "utf-8"
      );
      await write(".gitignore", ignoreRules);
      const settings = await readFile(
        path.join(
          sourceRoot,
          "workspaces",
          definitionName,
          "apps/web/vercel.json"
        ),
        "utf-8"
      );
      await write("apps/web/vercel.json", settings);
      const taskSettings = '{"name":"@workspaces/fixture","private":true}';
      await write("tasks/package.json", taskSettings);
      await write("tasks/turbo.json", '{"extends":["//"]}');
      await write("apps/web/.next/cache/sentinel", "keep");
      await write("node_modules/.cache/turbo/sentinel", "keep");
      await updateDevelopmentWorkspace(sourceRoot, name, {
        install: false,
      });
      const second = await updateDevelopmentWorkspace(sourceRoot, name, {
        install: false,
      });
      const customer = path.join(scratch, name);
      await composeWorkspace(
        customer,
        {
          addOns: definition.addOns,
          auth: definition.providers.auth,
          cms: definition.providers.cms ?? "contentstack",
          commerce: definition.providers.commerce,
          install: false,
        },
        { sourceRoot }
      );
      const entries = await readdir(target, {
        recursive: true,
        withFileTypes: true,
      });
      expect({
        config: await readFile(path.join(target, "turbo.json"), "utf-8"),
        ignoreRules: await readFile(path.join(target, ".gitignore"), "utf-8"),
        links: entries.filter((entry) => entry.isSymbolicLink()).length,
        nextCache: await readFile(
          path.join(target, "apps/web/.next/cache/sentinel"),
          "utf-8"
        ),
        second,
        settings: await readFile(
          path.join(target, "apps/web/vercel.json"),
          "utf-8"
        ),
        taskSettings: await readFile(
          path.join(target, "tasks/package.json"),
          "utf-8"
        ),
        turboCache: await readFile(
          path.join(target, "node_modules/.cache/turbo/sentinel"),
          "utf-8"
        ),
      }).toMatchObject({
        config: await readFile(path.join(customer, "turbo.json"), "utf-8"),
        ignoreRules,
        links: 0,
        nextCache: "keep",
        second: { changed: 0, removed: 0, unowned: [] },
        settings,
        taskSettings,
        turboCache: "keep",
      });
      await expect(
        readFile(path.join(customer, "apps/web/vercel.json"), "utf-8")
      ).resolves.toBe(
        await readFile(path.join(sourceRoot, "apps/web/vercel.json"), "utf-8")
      );
      // Git evaluates ignore files within a materialized workspace too.
      await runGit(["init", "--quiet"], { cwd: target });
      const visible = await runGit(
        ["ls-files", "--others", "--exclude-standard"],
        { cwd: target }
      );
      expect(new Set(visible.stdout.trim().split("\n"))).toEqual(
        new Set([
          ".gitignore",
          "next-hydra.json",
          "apps/web/vercel.json",
          "tasks/package.json",
          "tasks/turbo.json",
        ])
      );
    },
    30_000
  );

  it("preserves edited ignore rules and releases old app rules", async () => {
    await updateWorkspaceFiles({
      dependencyHash: "previous-composition",
      files: [".gitignore", "apps/web/.gitignore"].map((file) => ({
        content: Buffer.from("/*\n!/vercel.json\n"),
        mode: 0o644,
        owner: "named workspace Git visibility",
        target: file,
      })),
      sourceRoot,
      targetRoot: target,
    });
    const ignoreRules =
      "/*\n!/.gitignore\n!/next-hydra.json\n# Workspace-owned policy\n";
    await write(".gitignore", ignoreRules);
    await updateDevelopmentWorkspace(sourceRoot, name, {
      install: false,
    });
    await expect(
      readFile(path.join(target, ".gitignore"), "utf-8")
    ).resolves.toBe(ignoreRules);
    await expect(
      readFile(path.join(target, "apps/web/.gitignore"), "utf-8")
    ).resolves.toBe("/*\n!/vercel.json\n");
  }, 30_000);

  it("keeps named deployment settings opt-in instead of installing customer hosting defaults", async () => {
    await updateDevelopmentWorkspace(sourceRoot, name, {
      install: false,
    });
    await expect(
      lstat(path.join(target, "apps/web/vercel.json"))
    ).rejects.toThrow("ENOENT");
    await write("apps/web/vercel.json", '{"framework":"nextjs"}');
    await updateDevelopmentWorkspace(sourceRoot, name, { install: false });
    await expect(
      readFile(path.join(target, "apps/web/vercel.json"), "utf-8")
    ).resolves.toBe('{"framework":"nextjs"}');
  }, 30_000);

  it.each(["apps/web/vercel.json", "apps/api/.gitignore"])(
    "migrates previously owned settings at %s",
    async (settingsPath) => {
      const canonical = path.join(sourceRoot, settingsPath);
      const settings = await readFile(canonical, "utf-8");
      // The previous constructor registered the source link in version-2 applied state.
      await seedLinkedWorkspace({
        files: [{ owner: "web", source: canonical, target: settingsPath }],
        sourceRoot,
        targetRoot: target,
      });
      await updateDevelopmentWorkspace(sourceRoot, name, {
        check: true,
        install: false,
      });
      const before = await lstat(path.join(target, settingsPath));
      await updateDevelopmentWorkspace(sourceRoot, name, {
        install: false,
      });
      const after = await lstat(path.join(target, settingsPath));
      const migrated = await readFile(path.join(target, settingsPath), "utf-8");
      expect(after.isFile()).toBeTruthy();
      await write(settingsPath, '{"framework":"nextjs"}');
      const refreshed = await updateDevelopmentWorkspace(sourceRoot, name, {
        install: false,
      });
      expect({
        before: before.isSymbolicLink(),
        canonical: await readFile(canonical, "utf-8"),
        migrated,
        physical: after.isFile(),
        settings: await readFile(path.join(target, settingsPath), "utf-8"),
        unowned: refreshed.unowned,
      }).toEqual({
        before: true,
        canonical: settings,
        migrated: settings,
        physical: true,
        settings: '{"framework":"nextjs"}',
        unowned: [],
      });
    },
    30_000
  );

  it("uses independent physical source files on every refresh and protects local work", async () => {
    const settings = '{"framework":"nextjs"}';
    await write("apps/web/vercel.json", settings);
    await updateDevelopmentWorkspace(sourceRoot, name, { install: false });
    const routePath = "apps/web/app/api/draft/route.ts";
    const route = path.join(target, routePath);
    const canonical = path.join(
      sourceRoot,
      "packages/cms-contentstack/registry",
      routePath
    );
    const canonicalBefore = await readFile(canonical, "utf-8");
    const original = await readFile(route, "utf-8");
    const firstRoute = await lstat(route);
    expect(firstRoute.isFile()).toBeTruthy();
    await writeFile(route, "local edit");
    await expect(
      updateDevelopmentWorkspace(sourceRoot, name, { install: false })
    ).rejects.toThrow("locally modified");
    await expect(readFile(canonical, "utf-8")).resolves.toBe(canonicalBefore);
    await writeFile(route, original);
    await write("apps/web/new.ts", "unregistered");
    await expect(
      updateDevelopmentWorkspace(sourceRoot, name, { install: false })
    ).rejects.toThrow("unregistered files");
    await unlink(path.join(target, "apps/web/new.ts"));
    const second = await updateDevelopmentWorkspace(sourceRoot, name, {
      install: false,
    });
    const secondRoute = await lstat(route);
    expect({
      changed: second.changed,
      physical: secondRoute.isFile(),
      settings: await readFile(
        path.join(target, "apps/web/vercel.json"),
        "utf-8"
      ),
    }).toEqual({ changed: 0, physical: true, settings });
  }, 30_000);

  it.each([
    "unknown source",
    "linked cache",
    "linked settings",
    "linked ignore settings",
    "directory ignore settings",
    "linked task metadata",
    "unknown task source",
    "unselected app",
    "preexisting build output",
  ])(
    "refuses %s before writing application files",
    async (scenario) => {
      if (scenario === "unknown source") {
        await write("notes.txt", "do not lose");
      }
      if (scenario === "linked cache") {
        await symlink(scratch, path.join(target, "node_modules"));
      }
      if (scenario === "linked settings") {
        await mkdir(path.join(target, "apps/web"), { recursive: true });
        await symlink(
          path.join(scratch, "settings.json"),
          path.join(target, "apps/web/vercel.json")
        );
      }
      if (scenario === "linked ignore settings") {
        await mkdir(path.join(target, "apps/web"), { recursive: true });
        await symlink(
          path.join(scratch, "ignore"),
          path.join(target, "apps/web/.gitignore")
        );
      }
      if (scenario === "directory ignore settings") {
        await mkdir(path.join(target, "apps/web/.gitignore"), {
          recursive: true,
        });
      }
      if (scenario === "linked task metadata") {
        await mkdir(path.join(target, "tasks"));
        await symlink(
          path.join(scratch, "manifest.json"),
          path.join(target, "tasks/package.json")
        );
      }
      if (scenario === "unknown task source") {
        await write("tasks/new-script.ts", "do not lose");
      }
      if (scenario === "unselected app") {
        await write("apps/api/vercel.json", "{}");
      }
      if (scenario === "preexisting build output") {
        await write("apps/web/dist/output.js", "not a restored cache");
      }
      await expect(
        updateDevelopmentWorkspace(sourceRoot, name, {
          install: false,
        })
      ).rejects.toThrow(
        /unowned|physical directory|regular files|not selected/u
      );
      await expect(lstat(path.join(target, "package.json"))).rejects.toThrow(
        "ENOENT"
      );
    },
    30_000
  );
});
