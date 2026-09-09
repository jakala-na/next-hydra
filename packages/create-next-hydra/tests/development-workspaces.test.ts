/* oxlint-disable vitest/max-expects -- Exercise initialization, update and ownership preservation as one real lifecycle. */
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { readPackageJson } from "../src/composition/packages.js";
import {
  explainDevelopmentWorkspace,
  updateDevelopmentWorkspace,
} from "../src/development-workspaces.js";
import { WORKSPACE_LOCK } from "../src/workspace-update.js";

const sourceRoot = path.resolve(import.meta.dirname, "../../..");
const name = `workspace-test-${randomUUID()}`;
const targetRoot = path.join(sourceRoot, "workspaces", name);

describe("named workspace lifecycle through the actual scaffold", () => {
  afterAll(async () => {
    await rm(targetRoot, { force: true, recursive: true });
  });

  it("initializes, refreshes, swaps providers and guards local work", async () => {
    const canonicalPaths = [
      "package.json",
      "pnpm-lock.yaml",
      "workspaces/storefront-contentstack/next-hydra.json",
      "apps/web/package.json",
      "apps/web/tsconfig.json",
      "apps/web/registry/templates/layout.tsx.template",
      "packages/cms-contentstack/registry/templates/component-registry.ts.template",
      "packages/cms-drupal/registry/templates/component-registry.ts.template",
    ];
    const readCanonicalFiles = async () =>
      await Promise.all(
        canonicalPaths.map(
          async (file) => await readFile(path.join(sourceRoot, file), "utf-8")
        )
      );
    const canonicalBefore = await readCanonicalFiles();
    await mkdir(targetRoot, { recursive: true });
    const definitionPath = path.join(targetRoot, "next-hydra.json");
    const definition = JSON.stringify({
      addOns: [],
      providers: { cms: "contentstack" },
    });
    await writeFile(definitionPath, definition);
    const first = await updateDevelopmentWorkspace(sourceRoot, name, {
      install: false,
    });
    expect(first.changed).toBeGreaterThan(0);
    const webManifest = await readPackageJson(
      path.join(targetRoot, "apps/web/package.json")
    );
    expect(webManifest).toMatchObject({
      portless: { name: `web.${name}`, script: "dev:app" },
      scripts: {
        dev: "portless",
        "dev:app": "NODE_USE_SYSTEM_CA=1 next dev --turbopack",
      },
    });
    expect(webManifest.portless).not.toHaveProperty("appPort");
    const sourceManifest = await readPackageJson(
      path.join(sourceRoot, "package.json")
    );
    await expect(
      readPackageJson(path.join(targetRoot, "package.json"))
    ).resolves.toMatchObject({
      devDependencies: { portless: sourceManifest.devDependencies?.portless },
      name,
    });
    await expect(readFile(definitionPath, "utf-8")).resolves.toBe(definition);
    const layout = path.join(targetRoot, "apps/web/app/[locale]/layout.tsx");
    const originalLayout = await readFile(layout, "utf-8");
    const info = await lstat(layout);
    expect(info.isSymbolicLink()).toBeFalsy();
    const explanation = await explainDevelopmentWorkspace(
      sourceRoot,
      name,
      "apps/web/app/[locale]/layout.tsx"
    );
    expect(explanation).toContain("Owner: app-web");
    expect(explanation).toContain(
      path.join(sourceRoot, "apps/web/registry/templates/layout.tsx.template")
    );
    expect(explanation).toContain("Physical output");
    await expect(
      explainDevelopmentWorkspace(
        sourceRoot,
        name,
        "apps/web/app/api/draft/route.ts"
      )
    ).resolves.toContain("Source-linked");
    await expect(
      explainDevelopmentWorkspace(sourceRoot, name, "apps/web/new.tsx")
    ).resolves.toContain("not selected");
    const second = await updateDevelopmentWorkspace(sourceRoot, name, {
      install: false,
    });
    expect(second).toMatchObject({
      changed: 0,
      conflicts: [],
      removed: 0,
      unowned: [],
    });

    await writeFile(
      definitionPath,
      JSON.stringify({
        addOns: ["app-web-navigation-search"],
        providers: { cms: "drupal" },
      })
    );
    const third = await updateDevelopmentWorkspace(sourceRoot, name, {
      install: false,
    });
    expect(third.removed).toBeGreaterThan(0);
    const refreshedLayout = await readFile(layout, "utf-8");
    expect(refreshedLayout).not.toBe(originalLayout);
    expect(refreshedLayout).toContain("<HeaderSearch />");
    const route = path.join(targetRoot, "apps/web/app/api/draft/route.ts");
    expect(path.resolve(path.dirname(route), await readlink(route))).toBe(
      path.join(
        sourceRoot,
        "packages/cms-drupal/registry/apps/web/app/api/draft/route.ts"
      )
    );

    await writeFile(
      definitionPath,
      JSON.stringify({
        addOns: ["app-web-navigation-search"],
        development: { port: 3500 },
        providers: { auth: "clerk", cms: "drupal", commerce: "commercetools" },
      })
    );
    await updateDevelopmentWorkspace(sourceRoot, name, { install: false });
    const ports = { admin: 3502, api: 3501, web: 3500 };
    await Promise.all(
      Object.entries(ports).map(async ([app, appPort]) => {
        await expect(
          readPackageJson(path.join(targetRoot, `apps/${app}/package.json`))
        ).resolves.toMatchObject({
          portless: { appPort, name: `${app}.${name}`, script: "dev:app" },
          scripts: {
            dev: "portless",
            "dev:app": "NODE_USE_SYSTEM_CA=1 next dev --turbopack",
          },
        });
      })
    );
    await expect(readCanonicalFiles()).resolves.toEqual(canonicalBefore);

    const newFile = path.join(
      targetRoot,
      "apps/web/components/new-component.tsx"
    );
    await writeFile(newFile, "new authoring work");
    const status = await updateDevelopmentWorkspace(sourceRoot, name, {
      check: true,
    });
    expect(status.unowned).toContain("apps/web/components/new-component.tsx");
    expect(status.origins).toContainEqual({
      origin: {
        kind: "template",
        path: "apps/web/registry/templates/layout.tsx.template",
      },
      owner: "app-web",
      target: "apps/web/app/[locale]/layout.tsx",
    });
    expect(status.origins).toContainEqual({
      origin: {
        kind: "template",
        path: "packages/cms-drupal/registry/templates/component-registry.ts.template",
      },
      owner: "cms-drupal",
      target: "packages/cms-drupal/components/component-registry.ts",
    });
    await writeFile(layout, "local layout edit");
    await expect(
      updateDevelopmentWorkspace(sourceRoot, name, { install: false })
    ).rejects.toThrow("locally modified");
    await expect(readFile(layout, "utf-8")).resolves.toBe("local layout edit");
    await expect(readFile(newFile, "utf-8")).resolves.toBe(
      "new authoring work"
    );
    await expect(lstat(path.join(targetRoot, WORKSPACE_LOCK))).rejects.toThrow(
      "ENOENT"
    );

    await writeFile(path.join(targetRoot, WORKSPACE_LOCK), '{"pid":0}');
    await expect(
      updateDevelopmentWorkspace(sourceRoot, name, { install: false })
    ).rejects.toThrow("Cannot acquire workspace update lock");
  }, 60_000);

  it.each(["trailing-", "A-site", "a".repeat(64), "../source"])(
    "rejects invalid hostname labels before touching files: %s",
    async (invalidName) => {
      await expect(
        updateDevelopmentWorkspace(sourceRoot, invalidName)
      ).rejects.toThrow("It also names the local host");
    }
  );
});
