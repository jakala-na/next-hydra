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
    ).toBeTruthy();
    expect(
      isManagedApplicationSource(
        "packages/example/src/registry/lookup.ts",
        "~/packages/example/src/registry/lookup.ts"
      )
    ).toBeFalsy();
  });

  it("loads the official registry artifacts and required package targets", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot);

    expect([...catalog.items.keys()].sort()).toStrictEqual([
      "auth-clerk",
      "auth-contract",
      "auth-workos",
      "cms-contentstack",
      "cms-drupal",
      "commerce-commercetools",
      "drupal",
      "next-hydra-standard",
    ]);

    const drupal = await loadRegistryItem("cms-drupal", { cwd: repoRoot });
    const contentstack = await loadRegistryItem("cms-contentstack", {
      cwd: repoRoot,
    });
    const backendApp = await loadRegistryItem("drupal", { cwd: repoRoot });

    expect(drupal.docs).toContain("From apps/drupal, run ddev install");
    expect(drupal.files?.map((file) => file.target)).toContain(
      "~/packages/cms-drupal/package.json"
    );
    expect(contentstack.files?.map((file) => file.target)).toContain(
      "~/packages/cms-contentstack/package.json"
    );
    const backendTargets = new Set(
      backendApp.files?.map((file) => file.target)
    );
    expect(backendTargets).toContain("~/apps/drupal/composer.json");
    expect(backendTargets).toContain(
      "~/apps/drupal/recipes/next-hydra-starter/recipe.yml"
    );
    expect(backendTargets).not.toContain("~/apps/drupal/docroot/index.php");
    expect(backendTargets).not.toContain("~/apps/drupal/docroot/.htaccess");
    expect(
      [
        ...(drupal.files ?? []),
        ...(contentstack.files ?? []),
        ...(backendApp.files ?? []),
      ].every((file) => Boolean(file.target && file.content !== undefined))
    ).toBeTruthy();
  });

  it("resolves the portable standard preset", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot);

    expect(selectionFromPreset(catalog, "standard")).toStrictEqual({
      addOns: [],
      providers: {
        auth: "workos",
        cms: "drupal",
        commerce: "commercetools",
      },
    });
  });

  it("plans Clerk with component routes and auth package aliases", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot);
    const clerkRegistry = await loadRegistryItem("auth-clerk", {
      cwd: repoRoot,
    });
    const clerk = planComposition(catalog, {
      addOns: [],
      providers: {
        auth: "clerk",
        cms: "drupal",
        commerce: "commercetools",
      },
    });

    expect(clerk.registryItems).toStrictEqual([
      "auth-clerk",
      "auth-contract",
      "cms-drupal",
      "commerce-commercetools",
      "drupal",
    ]);
    expect(clerk.managedTargets).toEqual(
      expect.arrayContaining([
        "apps/web/app/sign-in/[[...sign-in]]/page.tsx",
        "apps/web/app/sign-out/page.tsx",
      ])
    );
    expect(clerkRegistry.files?.map((file) => file.target)).toEqual(
      expect.arrayContaining([
        "~/packages/auth-clerk/access-token.ts",
        "~/packages/auth-clerk/identity-users.ts",
        "~/packages/auth-clerk/invitations.ts",
      ])
    );
    expect(
      clerk.managedTargets.some(
        (target) =>
          target === "apps/api/app/api/webhooks/clerk/route.ts" ||
          target === "apps/web/app/sign-up/[[...sign-up]]/page.tsx"
      )
    ).toBeFalsy();
    expect(clerk.packageRequirements).toEqual(
      expect.arrayContaining([
        {
          cwd: "apps/api",
          name: "@repo/auth",
          section: "dependencies",
          specifier: "workspace:@repo/auth-clerk@*",
        },
        {
          cwd: "apps/web",
          name: "@repo/auth",
          section: "dependencies",
          specifier: "workspace:@repo/auth-clerk@*",
        },
      ])
    );
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

    expect(drupal.registryItems).toStrictEqual([
      "auth-contract",
      "auth-workos",
      "cms-drupal",
      "commerce-commercetools",
      "drupal",
    ]);
    expect(contentstack.registryItems).toStrictEqual([
      "auth-contract",
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
    expect(drupal.pnpmPatches).toHaveLength(DRUPAL_PNPM_PATCH_COUNT);
    expect(contentstack.pnpmPatches).toStrictEqual([
      {
        dependency: "@contentstack/cli-cm-import@2.0.0",
        path: "patches/@contentstack__cli-cm-import@2.0.0.patch",
      },
      {
        dependency: "@contentstack/cli-migration@2.0.0",
        path: "patches/@contentstack__cli-migration@2.0.0.patch",
      },
    ]);
    expect(drupal.instructions).toStrictEqual([
      "Configure the WorkOS environment variables described by packages/auth-workos before starting the applications.",
      "From apps/drupal, run ddev install to install Drupal and apply the starter recipe. Then configure the Drupal and Canvas environment variables described by packages/cms-drupal and apps/drupal.",
      "Configure the Commercetools environment variables described by packages/commerce-commercetools before starting the applications.",
    ]);
    expect(planComposition(catalog, drupal.selection)).toStrictEqual(drupal);
    expect(contentstack.variableTargets).toStrictEqual(drupal.variableTargets);
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
              target: "~/apps/drupal/external-backend.ts",
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

      expect(plan.selection.addOns).toStrictEqual([artifactPath]);
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
      fetchItems: async (items) => {
        requests.push(items);
        return [items[0] === helperReference ? helper : pinned];
      },
      itemByReference: catalog.itemByReference,
      items: catalog.items.values(),
      references: [unpinnedReference, reference],
      repository: "jakala-na/next-hydra",
    });

    expect(requests).toStrictEqual([[reference], [helperReference]]);
    expect(graph.items.get("cms-drupal")).toStrictEqual(pinned);
    expect(graph.items.get(helper.name)).toStrictEqual(helper);
    expect(graph.itemByReference.get(reference)).toBe("cms-drupal");
  });

  it("publishes a complete registry-item schema for Selection Definitions", async () => {
    const selectionSchema = JSON.parse(
      await readFile(
        path.join(
          repoRoot,
          "packages/create-next-hydra/schema/selection-definition.json"
        ),
        "utf-8"
      )
    );
    const sourceRegistrySchema = JSON.parse(
      await readFile(
        path.join(
          repoRoot,
          "packages/create-next-hydra/schema/source-registry.json"
        ),
        "utf-8"
      )
    );
    const catalog = await loadSourceRegistryCatalog(repoRoot);

    expect(selectionSchema.allOf[0].$ref).toBe(
      "https://ui.shadcn.com/schema/registry-item.json"
    );
    expect(selectionSchema.$defs.nextHydra.additionalProperties).toBeFalsy();
    expect(sourceRegistrySchema.allOf[1].properties.items.items.then.$ref).toBe(
      NEXT_HYDRA_SELECTION_SCHEMA_URL
    );
    expect(
      catalog.selections.every(
        (selection) =>
          catalog.items.get(selection.itemName)?.$schema ===
          NEXT_HYDRA_SELECTION_SCHEMA_URL
      )
    ).toBeTruthy();
  });
});
