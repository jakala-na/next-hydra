import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadRegistryItem } from "shadcn/registry";
import { describe, expect, it } from "vitest";

import {
  addCatalogReferences,
  loadSourceRegistryCatalog,
} from "../src/composition/catalog.js";
import { prepareComposition } from "../src/composition/install.js";
import {
  planComposition,
  selectionFromPreset,
} from "../src/composition/planner.js";
import { NEXT_HYDRA_SELECTION_SCHEMA_URL } from "../src/composition/schema.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const MINIMUM_CONTENTSTACK_FILES = 30;
const MINIMUM_DRUPAL_FILES = 70;
const MINIMUM_SIDECAR_FILES = 120;
const DRUPAL_CMS_ROUTE_COUNT = 7;
const DRUPAL_PNPM_PATCH_COUNT = 3;

describe("Next Hydra source registry", () => {
  it("loads the real included registry and complete CMS artifacts", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot);

    expect([...catalog.items.keys()].sort()).toEqual([
      "auth-workos",
      "cms-contentstack",
      "cms-drupal",
      "commerce-commercetools",
      "drupal-hydra",
      "next-hydra-standard",
    ]);

    const drupal = await loadRegistryItem("cms-drupal", { cwd: repoRoot });
    const contentstack = await loadRegistryItem("cms-contentstack", {
      cwd: repoRoot,
    });
    const sidecar = await loadRegistryItem("drupal-hydra", { cwd: repoRoot });

    expect(drupal.files?.length).toBeGreaterThan(MINIMUM_DRUPAL_FILES);
    expect(contentstack.files?.length).toBeGreaterThan(
      MINIMUM_CONTENTSTACK_FILES
    );
    expect(sidecar.files?.length).toBeGreaterThan(MINIMUM_SIDECAR_FILES);
    expect(
      [
        ...(drupal.files ?? []),
        ...(contentstack.files ?? []),
        ...(sidecar.files ?? []),
      ].every((file) => Boolean(file.target && file.content !== undefined))
    ).toBe(true);
  });

  it("resolves the portable standard preset", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot);

    expect(selectionFromPreset(catalog, "standard")).toEqual({
      addOns: [],
      providers: {
        auth: "workos",
        cms: "drupal",
        commerce: "commercetools",
      },
    });
  });

  it("plans both supported CMS compositions deterministically", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot);
    const base = {
      auth: "workos",
      commerce: "commercetools",
    };
    const drupal = planComposition(catalog, {
      addOns: [],
      providers: { ...base, cms: "drupal" },
    });
    const contentstack = planComposition(catalog, {
      addOns: [],
      providers: { ...base, cms: "contentstack" },
    });

    expect(drupal.installUnits.map(({ cwd, item }) => ({ cwd, item }))).toEqual(
      [
        { cwd: "packages/auth-workos", item: "auth-workos" },
        { cwd: "packages/cms-drupal", item: "cms-drupal" },
        { cwd: "apps/drupal-hydra", item: "drupal-hydra" },
        {
          cwd: "packages/commerce-commercetools",
          item: "commerce-commercetools",
        },
      ]
    );
    expect(
      contentstack.installUnits.map(({ cwd, item }) => ({ cwd, item }))
    ).toEqual([
      { cwd: "packages/auth-workos", item: "auth-workos" },
      { cwd: "packages/cms-contentstack", item: "cms-contentstack" },
      {
        cwd: "packages/commerce-commercetools",
        item: "commerce-commercetools",
      },
    ]);
    expect(
      drupal.routes.filter((route) => route.module.startsWith("@repo/cms"))
    ).toHaveLength(DRUPAL_CMS_ROUTE_COUNT);
    expect(
      contentstack.routes.filter((route) =>
        route.module.startsWith("@repo/cms")
      )
    ).toHaveLength(2);
    expect(drupal.assets).toEqual([
      {
        source:
          "apps/drupal-hydra/recipes/next-hydra-starter/content/file/next-hydra-hero.webp",
        target:
          "apps/drupal-hydra/recipes/next-hydra-starter/content/file/next-hydra-hero.webp",
      },
      {
        source: "patches/@drupal-canvas__headless-next.patch",
        target: "patches/@drupal-canvas__headless-next.patch",
      },
      {
        source: "patches/@drupal-canvas__headless-react.patch",
        target: "patches/@drupal-canvas__headless-react.patch",
      },
      {
        source: "patches/@drupal-canvas__headless.patch",
        target: "patches/@drupal-canvas__headless.patch",
      },
    ]);
    expect(drupal.pnpmPatches).toHaveLength(DRUPAL_PNPM_PATCH_COUNT);
    expect(contentstack.pnpmPatches).toEqual([]);
    expect(planComposition(catalog, drupal.selection)).toEqual(drupal);
    expect(contentstack.variableTargets).toEqual(drupal.variableTargets);
  });

  it("loads a locally developed Add-on without adding it to the root registry", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "next-hydra-external-selection-")
    );
    try {
      const artifactPath = path.join(temporaryDirectory, "external-dam.json");
      await writeFile(
        artifactPath,
        `${JSON.stringify(
          {
            $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL,
            files: [
              {
                content: "export const externalDam = true;\n",
                path: "dam.ts",
                target: "~/packages/cms-drupal/integrations/external-dam.ts",
                type: "registry:file",
              },
            ],
            meta: {
              nextHydra: {
                compatibility: {
                  conflicts: [],
                  requires: ["next-hydra/cms/drupal"],
                },
                id: "example/add-on/external-dam",
                installUnits: [{ cwd: ".", item: "external-dam" }],
                kind: "add-on",
              },
            },
            name: "external-dam",
            type: "registry:item",
          },
          null,
          2
        )}\n`
      );

      const catalog = await addCatalogReferences(
        await loadSourceRegistryCatalog(repoRoot),
        [artifactPath]
      );
      const plan = planComposition(catalog, {
        addOns: [artifactPath],
        providers: {
          auth: "workos",
          cms: "drupal",
          commerce: "commercetools",
        },
      });
      const prepared = await prepareComposition(catalog, plan);

      expect(plan.selection.addOns).toEqual([artifactPath]);
      expect(
        prepared.units.find((unit) => unit.item === "external-dam")?.artifact
          .files?.[0]?.content
      ).toBe("export const externalDam = true;\n");
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("publishes a complete registry-item schema for Selection Definitions", async () => {
    const selectionSchema = JSON.parse(
      await readFile(
        path.join(
          repoRoot,
          "packages/create-next-hydra/schema/selection-definition.json"
        ),
        "utf8"
      )
    );
    const sourceRegistrySchema = JSON.parse(
      await readFile(
        path.join(
          repoRoot,
          "packages/create-next-hydra/schema/source-registry.json"
        ),
        "utf8"
      )
    );
    const catalog = await loadSourceRegistryCatalog(repoRoot);

    expect(selectionSchema.allOf[0].$ref).toBe(
      "https://ui.shadcn.com/schema/registry-item.json"
    );
    expect(selectionSchema.$defs.nextHydra.additionalProperties).toBe(false);
    expect(sourceRegistrySchema.allOf[1].properties.items.items.then.$ref).toBe(
      NEXT_HYDRA_SELECTION_SCHEMA_URL
    );
    expect(
      catalog.selections.every(
        (selection) =>
          catalog.items.get(selection.itemName)?.$schema ===
          NEXT_HYDRA_SELECTION_SCHEMA_URL
      )
    ).toBe(true);
  });
});
