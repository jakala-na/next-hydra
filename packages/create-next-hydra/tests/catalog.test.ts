import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadRegistryItem } from "shadcn/registry";
import { describe, expect, it } from "vitest";

import {
  addCatalogReferences,
  fetchRegistryItemGraph,
  loadSourceRegistryCatalog,
} from "../src/composition/catalog.js";
import { prepareComposition } from "../src/composition/install.js";
import { isManagedApplicationSource } from "../src/composition/paths.js";
import {
  planComposition,
  selectionFromPreset,
} from "../src/composition/planner.js";
import { NEXT_HYDRA_SELECTION_SCHEMA_URL } from "../src/composition/schema.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const MINIMUM_CONTENTSTACK_FILES = 30;
const MINIMUM_DRUPAL_FILES = 70;
const MINIMUM_SIDECAR_FILES = 120;
const CONTENTSTACK_MANAGED_FILE_COUNT = 7;
const DRUPAL_MANAGED_FILE_COUNT = 11;
const DRUPAL_PNPM_PATCH_COUNT = 3;

describe("Next Hydra source registry", () => {
  it("distinguishes registry-owned application files from ordinary registry-named source folders", () => {
    expect(
      isManagedApplicationSource(
        "packages/cms-drupal/registry/apps/web/app/api/draft/route.ts",
        "~/apps/web/app/api/draft/route.ts"
      )
    ).toBe(true);
    expect(
      isManagedApplicationSource(
        "packages/example/src/registry/lookup.ts",
        "~/packages/example/src/registry/lookup.ts"
      )
    ).toBe(false);
  });

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

    expect(drupal.registryItems).toEqual([
      "auth-workos",
      "cms-drupal",
      "commerce-commercetools",
      "drupal-hydra",
    ]);
    expect(contentstack.registryItems).toEqual([
      "auth-workos",
      "cms-contentstack",
      "commerce-commercetools",
    ]);
    expect(drupal.managedTargets).toHaveLength(DRUPAL_MANAGED_FILE_COUNT);
    expect(contentstack.managedTargets).toHaveLength(
      CONTENTSTACK_MANAGED_FILE_COUNT
    );
    expect(drupal.managedTargets).toContain(
      "apps/web/app/api/canvas/components/route.ts"
    );
    expect(contentstack.managedTargets).not.toContain(
      "apps/web/app/api/canvas/components/route.ts"
    );
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
      const backendPath = path.join(
        temporaryDirectory,
        "external-backend.json"
      );
      await writeFile(
        backendPath,
        `${JSON.stringify({
          files: [
            {
              content: "export const backend = true;\n",
              path: "backend.ts",
              target: "~/apps/drupal-hydra/external-backend.ts",
              type: "registry:file",
            },
          ],
          name: "external-backend",
          type: "registry:item",
        })}\n`
      );
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
                kind: "add-on",
              },
            },
            name: "external-dam",
            registryDependencies: [backendPath],
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
      expect(plan.registryItems).toContain("external-backend");
      expect(
        prepared.artifacts.find((item) => item.name === "external-dam")
          ?.files?.[0]?.content
      ).toBe("export const externalDam = true;\n");
      expect(prepared.itemByReference.get(backendPath)).toBe(
        "external-backend"
      );
      expect(prepared.registryConfig).toBe(catalog.registryConfig);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("fetches a pinned registry address instead of reusing its unpinned item", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot);
    const unpinnedReference = "jakala-na/next-hydra/cms-drupal";
    const reference = "jakala-na/next-hydra/cms-drupal#pinned-sha";
    const helperReference =
      "jakala-na/next-hydra/pinned-drupal-helper#pinned-sha";
    const current = catalog.items.get("cms-drupal");
    if (!current) {
      throw new Error("Missing Drupal registry fixture.");
    }
    const pinned = {
      ...current,
      description: "Pinned Drupal artifact",
      registryDependencies: [helperReference],
    };
    const helper = {
      files: [],
      name: "pinned-drupal-helper",
      type: "registry:item" as const,
    };
    const requests: string[][] = [];

    const graph = await fetchRegistryItemGraph({
      config: catalog.registryConfig,
      cwd: repoRoot,
      fetchItems: (items) => {
        requests.push(items);
        return Promise.resolve([
          items[0] === helperReference ? helper : pinned,
        ]);
      },
      itemByReference: catalog.itemByReference,
      items: catalog.items.values(),
      references: [unpinnedReference, reference],
      repository: "jakala-na/next-hydra",
    });

    expect(requests).toEqual([[reference], [helperReference]]);
    expect(graph.items.get("cms-drupal")).toEqual(pinned);
    expect(graph.items.get(helper.name)).toEqual(helper);
    expect(graph.itemByReference.get(reference)).toBe("cms-drupal");
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
