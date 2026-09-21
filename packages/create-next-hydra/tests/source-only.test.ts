/* oxlint-disable vitest/max-expects -- Verify source ownership and materialized output together for each committed definition. */
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadSourceRegistryCatalog } from "../src/composition/catalog.js";
import { prepareComposition } from "../src/composition/install.js";
import { planComposition } from "../src/composition/planner.js";
import {
  explainDevelopmentWorkspace,
  updateDevelopmentWorkspace,
  workspaceDefinitionSchema,
} from "../src/development-workspaces.js";
import { pathExists } from "../src/fs-utils.js";
import { WORKSPACE_STATE } from "../src/workspace-update.js";

const sourceRoot = path.resolve(import.meta.dirname, "../../..");

describe("source-only authoring", () => {
  it.each([
    "cms-contentstack",
    "cms-drupal",
    "storefront-contentstack",
    "storefront-drupal",
  ])(
    "materializes %s exclusively from canonical inputs",
    async (definitionName) => {
      const name = `workspace-test-${definitionName}-${randomUUID().slice(0, 8)}`;
      const targetRoot = path.join(sourceRoot, "workspaces", name);
      await mkdir(targetRoot, { recursive: true });
      try {
        await expect(
          pathExists(path.join(sourceRoot, "next-hydra.json"))
        ).resolves.toBeFalsy();
        const definitionText = await readFile(
          path.join(
            sourceRoot,
            "workspaces",
            definitionName,
            "next-hydra.json"
          ),
          "utf-8"
        );
        await writeFile(
          path.join(targetRoot, "next-hydra.json"),
          definitionText
        );
        const definition = workspaceDefinitionSchema.parse(
          JSON.parse(definitionText)
        );
        const catalog = await loadSourceRegistryCatalog(sourceRoot);
        const prepared = await prepareComposition(
          catalog,
          planComposition(catalog, definition)
        );

        // Explain works before initialization and must not install or create applied state.
        await expect(
          explainDevelopmentWorkspace(
            sourceRoot,
            name,
            "apps/web/app/[locale]/layout.tsx"
          )
        ).resolves.toContain("Edit template:");
        await expect(
          pathExists(path.join(targetRoot, WORKSPACE_STATE))
        ).resolves.toBeFalsy();
        await updateDevelopmentWorkspace(sourceRoot, name, { install: false });
        await expect(
          pathExists(
            path.join(
              targetRoot,
              "packages/design-system/components/commerce/providers/cart-context.tsx"
            )
          )
        ).resolves.toBe(Boolean(definition.providers.commerce));
        await expect(
          pathExists(
            path.join(
              targetRoot,
              "packages/design-system/components/layout/cart-button.tsx"
            )
          )
        ).resolves.toBe(Boolean(definition.providers.commerce));
        await Promise.all(
          prepared.renderedFiles.map(async (file) => {
            await expect(
              pathExists(path.join(sourceRoot, file.target))
            ).resolves.toBeFalsy();
            await expect(
              readFile(path.join(targetRoot, file.target), "utf-8")
            ).resolves.toBe(file.content);
            const info = await lstat(path.join(targetRoot, file.target));
            expect(info.isSymbolicLink()).toBeFalsy();
          })
        );
        const second = await updateDevelopmentWorkspace(sourceRoot, name, {
          install: false,
        });
        expect(second).toMatchObject({
          changed: 0,
          conflicts: [],
          removed: 0,
          unowned: [],
        });
        expect(second.origins).toEqual(
          expect.arrayContaining(
            prepared.renderedFiles.map((file) => ({
              origin: { kind: "template", path: file.source },
              owner: file.owner,
              target: file.target,
            }))
          )
        );
      } finally {
        await rm(targetRoot, { force: true, recursive: true });
      }
    },
    30_000
  );

  it("does not retain duplicate provider routes in root applications", async () => {
    const catalog = await loadSourceRegistryCatalog(sourceRoot);
    const relocated = [...catalog.items.values()]
      .flatMap((item) => item.files ?? [])
      .filter((file) => {
        const target = file.target?.replace(/^~\//u, "");
        return (
          target?.startsWith("apps/") &&
          file.path !== target &&
          /\.(?:ts|tsx)$/u.test(target)
        );
      });
    expect(relocated.length).toBeGreaterThan(0);
    await Promise.all(
      relocated.map(async (file) => {
        await expect(
          pathExists(
            path.join(sourceRoot, file.target?.replace(/^~\//u, "") ?? "")
          )
        ).resolves.toBeFalsy();
        await expect(
          pathExists(path.join(sourceRoot, file.path))
        ).resolves.toBeTruthy();
      })
    );
  });
});
