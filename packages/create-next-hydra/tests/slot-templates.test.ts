/* oxlint-disable vitest/max-expects -- These tests check the complete shared application composition contract. */
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { RegistryItem } from "shadcn/schema";
import { describe, expect, it } from "vitest";

import { loadSourceRegistryCatalog } from "../src/composition/catalog.js";
import { prepareComposition } from "../src/composition/install.js";
import { planComposition } from "../src/composition/planner.js";
import { selectionDefinitionSchema } from "../src/composition/schema.js";
import {
  planSlotTemplates,
  renderSlotTemplates,
  slotCompositionSchema,
} from "../src/composition/slot-templates.js";
import type { WorkspaceSelection } from "../src/composition/types.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const layoutTarget = "apps/web/app/[locale]/layout.tsx";

async function workspaceItems(withSignIn: boolean): Promise<RegistryItem[]> {
  const catalog = await loadSourceRegistryCatalog(repoRoot, "registry.json");
  const selection: WorkspaceSelection = {
    addOns: [],
    providers: {
      cms: "contentstack",
    },
  };
  if (withSignIn) {
    selection.providers.auth = "auth-workos";
  }
  const plan = planComposition(catalog, selection);
  return plan.registryItems.map((name) => {
    const item = catalog.items.get(name);
    if (!item) {
      throw new Error(`Missing selected registry item: ${name}`);
    }
    return item;
  });
}

describe("shared application slot templates", () => {
  it.each([false, true])(
    "includes built-in product collections only with Commerce (commerce=%s)",
    async (commerce) => {
      const catalog = await loadSourceRegistryCatalog(
        repoRoot,
        "registry.json"
      );
      const selection: WorkspaceSelection = {
        addOns: [],
        providers: { cms: "contentstack" },
      };
      if (commerce) {
        selection.providers.commerce = "commercetools";
        selection.providers.auth = "workos";
      }
      const plan = planComposition(catalog, selection);
      // Exercise the shared preparation path used by compose and customer creation.
      const prepared = await prepareComposition(catalog, plan);
      const files = new Map(
        prepared.renderedFiles.map((file) => [file.target, file.content])
      );
      const registry = files.get(
        "packages/cms-contentstack/components/component-registry.ts"
      );
      const query = files.get(
        "packages/cms-contentstack/components/pages/landing-page-query.ts"
      );
      expect(plan.selection.addOns).toStrictEqual([]);
      expect(
        plan.registryItems.includes("cms-contentstack-product-collection")
      ).toBe(commerce);
      expect(registry).toContain("HeroSection");
      expect(query).toContain("...HeroSectionBlock");
      expect(registry?.includes("DynamicProductCollection")).toBe(commerce);
      expect(query?.includes("...ProductCollectionBlock")).toBe(commerce);
      expect(plan.registryItems.includes("commerce")).toBe(commerce);
      expect(files.has("apps/web/lib/catalog-runtime.ts")).toBeFalsy();
      expect(
        plan.packageRequirements.some(
          (item) =>
            item.cwd === "packages/cms-contentstack" &&
            item.name === "@repo/commerce"
        )
      ).toBe(commerce);
      expect(
        prepared.renderedFiles.every(
          (file) =>
            !file.target.includes(".generated.") && !file.content.includes("{{")
        )
      ).toBeTruthy();
      expect(plan.registryItems.includes("auth-workos")).toBe(commerce);
      expect(files.get("apps/web/lib/catalog-runtime.ts") ?? "").not.toContain(
        "catalog-identity"
      );
    }
  );

  it("requires Auth for Commerce before preparing any files", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot);
    expect(() =>
      planComposition(catalog, {
        addOns: [],
        providers: { cms: "contentstack", commerce: "commercetools" },
      })
    ).toThrow("requires an auth provider");
    const plan = planComposition(catalog, {
      addOns: [],
      providers: {
        auth: "workos",
        cms: "contentstack",
        commerce: "commercetools",
      },
    });
    expect(plan.registryItems).toEqual(
      expect.arrayContaining([
        "commerce",
        "commerce-web",
        "commerce-api",
        "auth-workos-commerce",
      ])
    );
  });

  it("activates the CMS mapping for any selected Commerce provider, not a Commercetools identity", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot, "registry.json");
    const provider = catalog.byReference.get("commercetools");
    if (!provider) {
      throw new Error("Missing Commerce fixture");
    }
    const alternate = {
      ...provider,
      id: "example/commerce/alternate",
      itemName: "commerce-alternate",
    };
    catalog.items.set(alternate.itemName, {
      files: [],
      name: alternate.itemName,
      type: "registry:item",
    });
    catalog.itemByReference.set(alternate.itemName, alternate.itemName);
    catalog.byReference.set(alternate.id, alternate);
    const plan = planComposition(catalog, {
      addOns: [],
      providers: {
        auth: "workos",
        cms: "contentstack",
        commerce: alternate.id,
      },
    });
    expect(plan.registryItems).toContain("cms-contentstack-product-collection");
    expect(plan.registryItems).not.toContain("commerce-commercetools");
    expect(
      plan.selections.find(
        (item) =>
          item.kind === "recipe" &&
          item.itemName === "cms-contentstack-product-collection"
      )?.compatibility.requires
    ).toStrictEqual(["next-hydra/cms/contentstack"]);
    expect(() =>
      planComposition(catalog, {
        ...plan.selection,
        addOns: ["cms-contentstack-product-collection"],
      })
    ).toThrow("not an add-on");
  });

  it("rejects the retired text-fragment metadata instead of maintaining a second renderer", () => {
    expect(
      selectionDefinitionSchema.safeParse({
        id: "old/fragment",
        kind: "add-on",
        templateContributions: [],
      }).success
    ).toBeFalsy();
    expect(
      selectionDefinitionSchema.safeParse({
        id: "old/template",
        kind: "add-on",
        templates: [],
      }).success
    ).toBeFalsy();
  });

  it.each(["contribution", "integration"])(
    "rejects the retired %s kind instead of treating it as a recipe",
    (kind) => {
      expect(
        selectionDefinitionSchema.safeParse({ id: "example/recipe", kind })
          .success
      ).toBeFalsy();
    }
  );

  it("rejects the retired binding field instead of silently omitting its modules", () => {
    expect(
      slotCompositionSchema.safeParse({
        contributions: [
          {
            export: "Account",
            module: "./account",
            slot: "account",
            target: layoutTarget,
          },
        ],
      }).success
    ).toBeFalsy();
  });

  it("composes a CMS shell without authentication recipes", async () => {
    const items = await workspaceItems(false);
    const files = await renderSlotTemplates(repoRoot, items);
    const layout = files.find((file) => file.target === layoutTarget);

    expect(files).toHaveLength(8);
    expect(layout).toMatchObject({
      owner: "app-web",
      slotBindings: [],
      source: "apps/web/registry/templates/layout.tsx.template",
    });
    expect(layout?.content).not.toContain("AccountSlot=");
    expect(files.map((file) => file.content).join("\n")).not.toContain(
      "@repo/auth"
    );
  });

  it("installs account controls and binds authentication into all four shared files", async () => {
    const items = await workspaceItems(true);
    const files = await renderSlotTemplates(repoRoot, items);
    const contentByTarget = new Map(
      files.map((file) => [file.target, file.content])
    );
    const auth = items.find((item) => item.name === "web-auth");

    const accountControls = auth?.files?.find(
      (file) =>
        file.target === "~/apps/web/components/layout/account-controls.tsx"
    );
    expect(accountControls?.path).toBe(
      "apps/web/components/layout/account-controls.tsx"
    );
    await expect(
      readFile(
        path.join(repoRoot, "apps/web/components/layout/account-controls.tsx"),
        "utf-8"
      )
    ).resolves.toContain("as AccountControls");
    expect(
      items.flatMap((item) => item.files?.map((file) => file.target) ?? [])
    ).toContain("~/apps/web/app/api/auth/callback/route.ts");
    expect(contentByTarget.get(layoutTarget)).toContain(
      'import { AccountControls } from "@/components/layout/account-controls";'
    );
    expect(contentByTarget.get(layoutTarget)).toContain("<AccountControls />");
    expect(
      contentByTarget.get("apps/web/components/layout/document-shell.tsx")
    ).toContain("<AuthProvider>");
    expect(contentByTarget.get("apps/web/proxy.ts")).toContain("authProxy(");
    expect(contentByTarget.get("apps/web/env.ts")).toContain(
      'import { keys } from "@repo/auth/keys";'
    );
    expect(files.map((file) => file.content).join("\n")).not.toContain("{{");
  });

  it("rejects two template owners for the same target", async () => {
    const items = await workspaceItems(false);
    const shell = items.find((item) => item.name === "app-web");
    if (!shell) {
      throw new Error("Missing site shell");
    }

    await expect(
      renderSlotTemplates(repoRoot, [
        ...items,
        { ...shell, name: "another-site-shell" },
      ])
    ).rejects.toThrow("exactly one template owner");
  });

  it.each(["missingSearch", "toString", "constructor"])(
    "rejects a binding to undeclared slot %s",
    async (slot) => {
      const items = await workspaceItems(false);

      await expect(
        renderSlotTemplates(repoRoot, [
          ...items,
          {
            meta: {
              composition: {
                slotBindings: [
                  {
                    export: "Search",
                    module: "@/components/search",
                    slot,
                    target: layoutTarget,
                  },
                ],
              },
            },
            name: "site-search",
            type: "registry:item",
          },
        ])
      ).rejects.toThrow(`missing target or slot ${layoutTarget}#${slot}`);
    }
  );

  it("normalizes targets before detecting duplicate template ownership", () => {
    const items: RegistryItem[] = [layoutTarget, `./${layoutTarget}`].map(
      (target, index) => ({
        meta: {
          composition: {
            templates: [{ slots: {}, source: "layout.template", target }],
          },
        },
        name: `shell-${index}`,
        type: "registry:item",
      })
    );
    expect(() => planSlotTemplates(items)).toThrow(
      "exactly one template owner"
    );
  });

  it("matches slot bindings using normalized target paths", () => {
    expect(
      planSlotTemplates([
        {
          meta: {
            composition: {
              slotBindings: [
                {
                  export: "Account",
                  module: "./account",
                  slot: "account",
                  target: `./${layoutTarget}`,
                },
              ],
              templates: [
                {
                  slots: { account: "element" },
                  source: "layout.template",
                  target: layoutTarget,
                },
              ],
            },
          },
          name: "shell",
          type: "registry:item",
        },
      ])[0]?.slotBindings
    ).toMatchObject([{ export: "Account", target: layoutTarget }]);
  });
});
