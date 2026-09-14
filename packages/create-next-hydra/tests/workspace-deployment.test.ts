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
  updateDevelopmentWorkspace,
  workspaceDefinitionSchema,
} from "../src/development-workspaces.js";
import { runGit } from "../src/git.js";
import { updateWorkspaceFiles } from "../src/workspace-update.js";

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
    await rm(scratch, { force: true, recursive: true });
  });

  async function write(targetPath: string, content: string) {
    const absolute = path.join(target, targetPath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }

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
      await write("apps/web/.next/cache/sentinel", "keep");
      await write("node_modules/.cache/turbo/sentinel", "keep");
      await updateDevelopmentWorkspace(sourceRoot, name, {
        install: false,
        link: false,
      });
      const second = await updateDevelopmentWorkspace(sourceRoot, name, {
        install: false,
        link: false,
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
        turboCache: await readFile(
          path.join(target, "node_modules/.cache/turbo/sentinel"),
          "utf-8"
        ),
      }).toMatchObject({
        config: await readFile(path.join(customer, "turbo.json"), "utf-8"),
        links: 0,
        nextCache: "keep",
        second: { changed: 0, removed: 0, unowned: [] },
        settings,
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
        new Set(["next-hydra.json", "apps/web/vercel.json"])
      );
    },
    30_000
  );

  it("keeps named deployment settings opt-in instead of installing customer hosting defaults", async () => {
    await updateDevelopmentWorkspace(sourceRoot, name, {
      install: false,
      link: false,
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

  it.each([true, false])(
    "migrates previously owned deployment links when refreshing with link=%s",
    async (link) => {
      const settingsPath = "apps/web/vercel.json";
      const canonical = path.join(sourceRoot, settingsPath);
      const settings = await readFile(canonical, "utf-8");
      // The previous constructor registered the source link in version-2 applied state.
      await updateWorkspaceFiles({
        dependencyHash: "previous-composition",
        files: [{ owner: "web", source: canonical, target: settingsPath }],
        sourceRoot,
        targetRoot: target,
      });
      await updateDevelopmentWorkspace(sourceRoot, name, {
        check: true,
        install: false,
        link,
      });
      const before = await lstat(path.join(target, settingsPath));
      await updateDevelopmentWorkspace(sourceRoot, name, {
        install: false,
        link,
      });
      const after = await lstat(path.join(target, settingsPath));
      const migrated = await readFile(path.join(target, settingsPath), "utf-8");
      expect(after.isFile()).toBeTruthy();
      await write(settingsPath, '{"framework":"nextjs"}');
      const refreshed = await updateDevelopmentWorkspace(sourceRoot, name, {
        install: false,
        link,
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

  it("switches between linked and copied sources in place, protecting deployment settings and local work", async () => {
    const settings = '{"framework":"nextjs"}';
    await write("apps/web/vercel.json", settings);
    await updateDevelopmentWorkspace(sourceRoot, name, { install: false });
    const route = path.join(target, "apps/web/app/api/draft/route.ts");
    const linkedInfo = await lstat(route);
    const linked = linkedInfo.isSymbolicLink();
    const config = await readFile(path.join(target, "turbo.json"), "utf-8");
    await updateDevelopmentWorkspace(sourceRoot, name, {
      install: false,
      link: false,
    });
    const copiedInfo = await lstat(route);
    const copied = copiedInfo.isSymbolicLink();
    const original = await readFile(route, "utf-8");
    await writeFile(route, "local edit");
    await expect(
      updateDevelopmentWorkspace(sourceRoot, name, { install: false })
    ).rejects.toThrow("locally modified");
    await writeFile(route, original);
    await write("apps/web/new.ts", "unregistered");
    await expect(
      updateDevelopmentWorkspace(sourceRoot, name, {
        install: false,
        link: false,
      })
    ).rejects.toThrow("unregistered files");
    await unlink(path.join(target, "apps/web/new.ts"));
    await updateDevelopmentWorkspace(sourceRoot, name, { install: false });
    const relinkedInfo = await lstat(route);
    expect({
      config: await readFile(path.join(target, "turbo.json"), "utf-8"),
      copied,
      linked,
      relinked: relinkedInfo.isSymbolicLink(),
      settings: await readFile(
        path.join(target, "apps/web/vercel.json"),
        "utf-8"
      ),
    }).toEqual({
      config,
      copied: false,
      linked: true,
      relinked: true,
      settings,
    });
  }, 30_000);

  it.each([
    "unknown source",
    "linked cache",
    "linked settings",
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
      if (scenario === "unselected app") {
        await write("apps/api/vercel.json", "{}");
      }
      if (scenario === "preexisting build output") {
        await write("apps/web/dist/output.js", "not a restored cache");
      }
      await expect(
        updateDevelopmentWorkspace(sourceRoot, name, {
          install: false,
          link: false,
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
