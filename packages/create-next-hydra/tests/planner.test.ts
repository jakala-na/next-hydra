import path from "node:path";

import type { RegistryItem } from "shadcn/schema";
import { describe, expect, it } from "vitest";

import { loadSourceRegistryCatalog } from "../src/composition/catalog.js";
import { CompositionValidationError } from "../src/composition/errors.js";
import { planComposition } from "../src/composition/planner.js";
import { selectionDefinitionSchema } from "../src/composition/schema.js";
import type {
  CatalogSelection,
  SourceRegistryCatalog,
} from "../src/composition/types.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const MATERIALIZATION_CONFLICT = /Materialization targets conflict/u;
const STABLE_PROVIDER_ALIASES = /stable Provider aliases/u;

function withSelection(
  catalog: SourceRegistryCatalog,
  selection: CatalogSelection,
  item: RegistryItem
): SourceRegistryCatalog {
  const items = new Map<string, RegistryItem>([
    ...catalog.items,
    [item.name, item],
  ]);
  const selections = [...catalog.selections, selection];
  const byId = new Map([...catalog.byId, [selection.id, selection]]);
  const byReference = new Map([
    ...catalog.byReference,
    [selection.id, selection],
    [selection.itemName, selection],
  ]);
  return { ...catalog, byId, byReference, items, selections };
}

function replaceSelection(
  catalog: SourceRegistryCatalog,
  replacement: CatalogSelection
): SourceRegistryCatalog {
  const byId = new Map([...catalog.byId, [replacement.id, replacement]]);
  const byReference = new Map(
    [...catalog.byReference].map(([reference, selection]) => [
      reference,
      selection.id === replacement.id ? replacement : selection,
    ])
  );
  return {
    ...catalog,
    byId,
    byReference,
    selections: catalog.selections.map((selection) =>
      selection.id === replacement.id ? replacement : selection
    ),
  };
}

function addOn(overrides: Partial<CatalogSelection> = {}): CatalogSelection {
  return {
    assets: [],
    compatibility: {
      conflicts: [],
      requires: ["next-hydra/cms/drupal", "next-hydra/commerce/commercetools"],
    },
    id: "next-hydra/add-on/drupal-commerce-dam",
    itemName: "drupal-commerce-dam",
    kind: "add-on",
    packages: [],
    pnpmPatches: [],
    ...overrides,
  };
}

const addOnItem = {
  files: [
    {
      path: "frontend.ts",
      target: "~/packages/cms-drupal/integrations/dam.ts",
      type: "registry:file",
    },
    {
      path: "module.info.yml",
      target:
        "~/apps/drupal/docroot/modules/custom/next_hydra_dam/next_hydra_dam.info.yml",
      type: "registry:file",
    },
  ],
  name: "drupal-commerce-dam",
  type: "registry:item",
} satisfies RegistryItem;

describe("composition planner failures", () => {
  it("rejects unknown metadata keys", () => {
    const result = selectionDefinitionSchema.safeParse({
      id: "next-hydra/cms/example",
      kind: "provider",
      misspelledRoutes: [],
      slot: "cms",
    });

    expect(result.success).toBeFalsy();
  });

  it("rejects preset fields on an Add-on", () => {
    const result = selectionDefinitionSchema.safeParse({
      ...addOn(),
      selections: { addOns: [] },
    });

    expect(result.success).toBeFalsy();
  });

  it("rejects asset targets that name the workspace root", () => {
    for (const target of [".", "./", "././"]) {
      const result = selectionDefinitionSchema.safeParse({
        assets: [{ source: "asset.bin", target }],
        id: "next-hydra/cms/unsafe",
        kind: "provider",
        slot: "cms",
      });

      expect(result.success).toBeFalsy();
    }
  });

  it("requires every Provider to supply the stable aliases used by its slot", async () => {
    const provider: CatalogSelection = {
      assets: [],
      compatibility: { conflicts: [], requires: [] },
      id: "vendor/cms/private",
      itemName: "private-cms",
      kind: "provider",
      packages: [],
      pnpmPatches: [],
      slot: "cms",
    };
    const catalog = withSelection(
      await loadSourceRegistryCatalog(repoRoot),
      provider,
      {
        files: [],
        name: provider.itemName,
        type: "registry:item",
      }
    );

    expect(() =>
      planComposition(catalog, {
        addOns: [],
        providers: {
          auth: "workos",
          cms: provider.id,
          commerce: "commercetools",
        },
      })
    ).toThrow(STABLE_PROVIDER_ALIASES);
  });

  it("requires CMS Providers to supply the CLI alias", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot);
    const contentstack = catalog.byReference.get("contentstack");

    if (contentstack === undefined) {
      throw new Error("Contentstack provider is missing from the catalog");
    }

    const withoutCliAlias = {
      ...contentstack,
      packages: contentstack.packages.filter(
        (requirement) =>
          !(requirement.cwd === "apps/cli" && requirement.name === "@repo/cms")
      ),
    };

    expect(() =>
      planComposition(replaceSelection(catalog, withoutCliAlias), {
        addOns: [],
        providers: {
          auth: "workos",
          cms: "contentstack",
          commerce: "commercetools",
        },
      })
    ).toThrow(/apps\/cli\/dependencies\.@repo\/cms/u);
  });

  it("materializes a compatible cross-provider Add-on", async () => {
    const catalog = withSelection(
      await loadSourceRegistryCatalog(repoRoot),
      addOn(),
      addOnItem
    );

    const plan = planComposition(catalog, {
      addOns: ["drupal-commerce-dam"],
      providers: {
        auth: "workos",
        cms: "drupal",
        commerce: "commercetools",
      },
    });

    expect(plan.selection.addOns).toStrictEqual(["drupal-commerce-dam"]);
    expect(plan.registryItems).toStrictEqual([
      "auth-contract",
      "auth-workos",
      "cms-drupal",
      "commerce-commercetools",
      "drupal",
      "drupal-commerce-dam",
    ]);
  });

  it("rejects an incompatible Add-on before planning writes", async () => {
    const catalog = withSelection(
      await loadSourceRegistryCatalog(repoRoot),
      addOn(),
      addOnItem
    );

    expect(() =>
      planComposition(catalog, {
        addOns: ["drupal-commerce-dam"],
        providers: {
          auth: "workos",
          cms: "contentstack",
          commerce: "commercetools",
        },
      })
    ).toThrow(CompositionValidationError);
  });

  it("transitively includes Add-ons required by a Provider", async () => {
    const required = addOn({
      compatibility: {
        conflicts: [],
        requires: [
          "next-hydra/cms/drupal",
          "next-hydra/commerce/commercetools",
          "next-hydra/add-on/dam-core",
        ],
      },
    });
    const transitive = addOn({
      compatibility: {
        conflicts: [],
        requires: ["next-hydra/cms/drupal"],
      },
      id: "next-hydra/add-on/dam-core",
      itemName: "dam-core",
    });
    let catalog = withSelection(
      await loadSourceRegistryCatalog(repoRoot),
      required,
      addOnItem
    );
    catalog = withSelection(catalog, transitive, {
      files: [
        {
          path: "core.ts",
          target: "~/packages/cms-drupal/integrations/dam-core.ts",
          type: "registry:file",
        },
      ],
      name: "dam-core",
      type: "registry:item",
    });
    const drupal = catalog.byId.get("next-hydra/cms/drupal");
    if (!drupal) {
      throw new Error("Missing Drupal Provider fixture.");
    }
    catalog = replaceSelection(catalog, {
      ...drupal,
      compatibility: {
        ...drupal.compatibility,
        requires: [...drupal.compatibility.requires, required.id],
      },
    });

    const plan = planComposition(catalog, {
      addOns: [],
      providers: {
        auth: "workos",
        cms: "drupal",
        commerce: "commercetools",
      },
    });

    expect(plan.selection.addOns).toStrictEqual([
      "next-hydra/add-on/dam-core",
      "next-hydra/add-on/drupal-commerce-dam",
    ]);
    expect(plan.registryItems).toContain("dam-core");
    expect(plan.registryItems).toContain("drupal-commerce-dam");
  });

  it("rejects two selected contributions that write the same target", async () => {
    const collision = addOn();
    const catalog = withSelection(
      await loadSourceRegistryCatalog(repoRoot),
      collision,
      {
        ...addOnItem,
        files: [
          {
            path: "route.ts",
            target: "~/apps/web/app/api/draft/route.ts",
            type: "registry:file",
          },
        ],
      }
    );

    expect(() =>
      planComposition(catalog, {
        addOns: [collision.id],
        providers: {
          auth: "workos",
          cms: "drupal",
          commerce: "commercetools",
        },
      })
    ).toThrow(MATERIALIZATION_CONFLICT);
  });
});
