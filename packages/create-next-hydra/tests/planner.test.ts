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
const MATERIALIZATION_CONFLICT = /Materialization targets conflict/;
const ROUTE_CONFLICT = /Route claims conflict/;

function withSelection(
  catalog: SourceRegistryCatalog,
  selection: CatalogSelection,
  item: RegistryItem
): SourceRegistryCatalog {
  const items = new Map(catalog.items);
  const selections = [...catalog.selections, selection];
  const byId = new Map(catalog.byId);
  const byReference = new Map(catalog.byReference);
  items.set(item.name, item);
  byId.set(selection.id, selection);
  byReference.set(selection.id, selection);
  byReference.set(selection.itemName, selection);
  return { ...catalog, byId, byReference, items, selections };
}

function replaceSelection(
  catalog: SourceRegistryCatalog,
  replacement: CatalogSelection
): SourceRegistryCatalog {
  const byId = new Map(catalog.byId);
  byId.set(replacement.id, replacement);
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
    installUnits: [{ cwd: ".", item: "drupal-commerce-dam" }],
    itemName: "drupal-commerce-dam",
    kind: "add-on",
    packages: [],
    pnpmPatches: [],
    routes: [],
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
        "~/apps/drupal-hydra/web/modules/custom/next_hydra_dam/next_hydra_dam.info.yml",
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
      installUnits: [],
      kind: "provider",
      misspelledRoutes: [],
      slot: "cms",
    });

    expect(result.success).toBe(false);
  });

  it("rejects preset fields on an Add-on", () => {
    const result = selectionDefinitionSchema.safeParse({
      ...addOn(),
      selections: { addOns: [] },
    });

    expect(result.success).toBe(false);
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

    expect(plan.selection.addOns).toEqual(["drupal-commerce-dam"]);
    expect(plan.installUnits.map((unit) => unit.item)).toEqual([
      "auth-workos",
      "cms-drupal",
      "drupal-hydra",
      "commerce-commercetools",
      "drupal-commerce-dam",
    ]);
    expect(
      plan.installUnits.find((unit) => unit.item === "drupal-commerce-dam")
        ?.targets
    ).toEqual([
      "apps/drupal-hydra/web/modules/custom/next_hydra_dam/next_hydra_dam.info.yml",
      "packages/cms-drupal/integrations/dam.ts",
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
      installUnits: [{ cwd: "packages/cms-drupal", item: "dam-core" }],
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
          target: "~/integrations/dam-core.ts",
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

    expect(plan.selection.addOns).toEqual([
      "next-hydra/add-on/dam-core",
      "next-hydra/add-on/drupal-commerce-dam",
    ]);
    expect(plan.installUnits.map((unit) => unit.item)).toContain("dam-core");
    expect(plan.installUnits.map((unit) => unit.item)).toContain(
      "drupal-commerce-dam"
    );
  });

  it("rejects duplicate normalized route method claims", async () => {
    const collision = addOn({
      routes: [
        {
          app: "apps/web",
          export: "GET",
          method: "GET",
          module: "@repo/add-on/draft",
          path: "/api/draft/",
        },
      ],
    });
    const catalog = withSelection(
      await loadSourceRegistryCatalog(repoRoot),
      collision,
      addOnItem
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
    ).toThrow(ROUTE_CONFLICT);
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
