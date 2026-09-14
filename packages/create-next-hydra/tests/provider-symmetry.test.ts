/* oxlint-disable vitest/max-expects, vitest/no-conditional-expect -- One matrix checks both the shared contract and provider-specific routes. */
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { composeWorkspace } from "../src/compose.js";
import type { ComposeOptions } from "../src/compose.js";
import { loadSourceRegistryCatalog } from "../src/composition/catalog.js";
import { prepareComposition } from "../src/composition/install.js";
import { readPackageJson } from "../src/composition/packages.js";
import { planComposition } from "../src/composition/planner.js";
import type { WorkspaceSelection } from "../src/composition/types.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const combinations = ["contentstack", "drupal"].flatMap((cms) =>
  [undefined, "workos", "clerk"].flatMap((auth) =>
    [false, true].flatMap((commerce) =>
      [false, true].map((search) => ({ auth, cms, commerce, search }))
    )
  )
);

describe("copied and source-linked provider workspaces", () => {
  let scratch: string;
  beforeAll(async () => {
    await mkdir(path.join(repoRoot, "workspaces"), { recursive: true });
    scratch = await mkdtemp(
      path.join(repoRoot, "workspaces", "symmetry-test-")
    );
  });

  afterAll(async () => {
    // Only this test's uniquely created directory; rm does not follow source symlinks.
    await rm(scratch, { force: true, recursive: true });
  });

  it.each(
    ["contentstack", "drupal"].flatMap((cms) =>
      [false, true].flatMap((linked) =>
        [false, true].map((commerce) => ({ cms, commerce, linked }))
      )
    )
  )(
    "$cms linked=$linked commerce=$commerce",
    async ({ cms, linked, commerce }) => {
      const target = path.join(scratch, `${cms}-${linked}-${commerce}`);
      const options: ComposeOptions = {
        cms,
        install: false,
        linked,
        search: true,
      };
      if (commerce) {
        options.commerce = "commercetools";
        options.auth = "clerk";
      }
      await composeWorkspace(target, options);
      const receipt = path.join(target, ".workspace-composition.json");
      if (linked) {
        expect(JSON.parse(await readFile(receipt, "utf-8"))).toMatchObject({
          linked: true,
          version: 1,
        });
      } else {
        await expect(lstat(receipt)).rejects.toMatchObject({ code: "ENOENT" });
        await expect(
          readFile(path.join(target, ".gitignore"), "utf-8")
        ).resolves.not.toContain("workspace-composition");
      }
      const source = `packages/cms-${cms}/components/blocks/hero-section.tsx`;
      const composed = `packages/cms-${cms}/components/component-registry.ts`;
      const sourceStat = await lstat(path.join(target, source));
      expect(sourceStat.isSymbolicLink()).toBe(linked);
      if (linked) {
        await expect(realpath(path.join(target, source))).resolves.toBe(
          path.join(repoRoot, source)
        );
      }
      const composedStat = await lstat(path.join(target, composed));
      expect(composedStat.isSymbolicLink()).toBeFalsy();
      const renderer = await readFile(
        path.join(
          target,
          `packages/cms-${cms}/components/component-renderer.tsx`
        ),
        "utf-8"
      );
      expect(renderer.includes("@composition/")).toBe(linked);
      if (!linked) {
        expect(renderer).toContain('"./component-registry"');
      }
      const manifest = await readPackageJson(
        path.join(target, `packages/cms-${cms}/package.json`)
      );
      expect(Boolean(manifest.dependencies?.["@repo/commerce"])).toBe(commerce);
      const app = await readPackageJson(
        path.join(target, "apps/web/package.json")
      );
      expect(app.dependencies?.["@repo/auth"]).toBe(
        commerce ? "workspace:@repo/auth-clerk@*" : undefined
      );
      expect(app.dependencies?.["lucide-react"]).toBe("^0.511.0");
      const search = "apps/web/components/layout/header-search.tsx";
      const searchStat = await lstat(path.join(target, search));
      expect(searchStat.isSymbolicLink()).toBe(linked);
      const layout = await readFile(
        path.join(target, "apps/web/app/[locale]/layout.tsx"),
        "utf-8"
      );
      expect(layout.match(/Search=\{headerSearch\}/gu)).toHaveLength(2);
      expect(layout.includes("CartSlot=")).toBe(commerce);
      expect(layout.includes("BusinessUnitSwitcher=")).toBe(commerce);
      if (commerce) {
        await Promise.all(
          ["api", "admin"].flatMap((name) =>
            ["env.ts", "next.config.ts"].map(async (file) => {
              const info = await lstat(path.join(target, "apps", name, file));
              expect(info.isSymbolicLink()).toBeFalsy();
            })
          )
        );
        const cartStat = await lstat(
          path.join(target, "apps/web/components/layout/header-cart.tsx")
        );
        expect(cartStat.isSymbolicLink()).toBe(linked);
        const cartActions = await readFile(
          path.join(target, "apps/web/lib/cart-actions.ts"),
          "utf-8"
        );
        expect(cartActions).toContain("./commerce-actions");
        const checkout = "apps/web/app/[locale]/checkout/page.tsx";
        const checkoutInfo = await lstat(path.join(target, checkout));
        expect(checkoutInfo.isSymbolicLink()).toBe(linked);
        const checkoutSource = await readFile(
          path.join(repoRoot, checkout),
          "utf-8"
        );
        await expect(
          readFile(path.join(target, checkout), "utf-8")
        ).resolves.toBe(checkoutSource);
      }
      if (commerce) {
        const route = "apps/web/app/[locale]/sign-in/[[...sign-in]]/page.tsx";
        const routeStat = await lstat(path.join(target, route));
        expect(routeStat.isSymbolicLink()).toBe(linked);
        if (linked) {
          await expect(realpath(path.join(target, route))).resolves.toBe(
            path.join(repoRoot, "packages/auth-clerk/registry", route)
          );
        }
      }
      if (cms === "drupal") {
        const projectStat = await lstat(
          path.join(target, "packages/cms-drupal/canvas-project.ts")
        );
        expect(projectStat.isSymbolicLink()).toBeFalsy();
        const installer = await lstat(
          path.join(target, "apps/drupal/.ddev/commands/host/install")
        );
        // oxlint-disable-next-line no-bitwise -- Check the POSIX executable permission bits.
        expect(installer.mode & 0o111).not.toBe(0);
      }
      await expect(
        composeWorkspace(target, { cms, install: false })
      ).rejects.toThrow("Refusing to replace");
    },
    30_000
  );
});

describe("symmetric provider composition", () => {
  it("keeps Drupal's base content independent and layers a native Commerce recipe", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot);
    const prepared = await prepareComposition(
      catalog,
      planComposition(catalog, {
        addOns: [],
        providers: { auth: "clerk", cms: "drupal", commerce: "commercetools" },
      })
    );
    const base = prepared.artifacts.find((item) => item.name === "drupal");
    const packageRecipe = prepared.artifacts.find(
      (item) => item.name === "drupal-product-collection"
    );
    const baseData = base?.files
      ?.filter((file) =>
        /\/recipes\/[^/]+\/(?:config|content)\//u.test(file.target ?? "")
      )
      .map((file) => file.content)
      .join("\n");
    expect(baseData).not.toMatch(
      /dynamic_product_collection|js\.product-collection|field_product_category/u
    );
    const recipe = packageRecipe?.files?.find((file) =>
      file.path.endsWith("/recipe.yml")
    );
    expect(parseYaml(recipe?.content ?? "")).toMatchObject({
      config: {
        actions: {
          "field.field.node.landing_page.field_components": {
            setProperties: {
              "settings.handler_settings.target_bundles.dynamic_product_collection":
                "dynamic_product_collection",
            },
          },
          "graphql_compose.settings": {
            simpleConfigUpdate: {
              "entity_config.paragraph.dynamic_product_collection": {
                enabled: true,
              },
            },
          },
        },
      },
      recipes: ["next-hydra-starter"],
    });
    const samples = packageRecipe?.files
      ?.filter((file) => file.path.includes("/content/"))
      .map((file) => file.content)
      .join("\n");
    expect(samples).toContain("/catalog-example");
    expect(samples).toContain("/canvas-catalog-example");
    expect(samples).not.toMatch(/Next Hydra|Hydra/u);
  });

  it.each(combinations)(
    "$cms / $auth / commerce=$commerce / search=$search",
    async ({ cms, auth, commerce, search }) => {
      const catalog = await loadSourceRegistryCatalog(
        repoRoot,
        "registry.json"
      );
      const selection: WorkspaceSelection = {
        addOns: search ? ["app-web-navigation-search"] : [],
        providers: {
          cms,
        },
      };
      if (auth) {
        selection.providers.auth = auth;
      }
      if (commerce) {
        selection.providers.commerce = "commercetools";
      }
      if (commerce && !auth) {
        expect(() => planComposition(catalog, selection)).toThrow(
          "requires an auth provider"
        );
        return;
      }
      const plan = planComposition(catalog, selection);
      const prepared = await prepareComposition(catalog, plan);
      const rendered = new Map(
        prepared.renderedFiles.map((file) => [file.target, file.content])
      );
      const artifacts = prepared.artifacts.filter((item) =>
        plan.registryItems.includes(item.name)
      );
      const targets = artifacts.flatMap(
        (item) => item.files?.map((file) => file.target) ?? []
      );
      expect(plan.selection.addOns).toHaveLength(search ? 1 : 0);
      const layout = rendered.get("apps/web/app/[locale]/layout.tsx") ?? "";
      expect(layout.includes("CartSlot=")).toBe(commerce);
      expect(layout.includes("<CommerceProvider>")).toBe(commerce);
      expect(layout.includes("BusinessUnitSwitcher=")).toBe(
        Boolean(commerce && auth)
      );
      expect(layout.match(/Search=\{headerSearch\}/gu) ?? []).toHaveLength(
        search ? 2 : 0
      );
      expect(
        targets.includes("~/apps/web/components/layout/header-search.tsx")
      ).toBe(search);
      expect(targets.includes("~/apps/web/lib/cart-actions.ts")).toBe(commerce);
      expect(
        targets.includes("~/apps/web/lib/commerce-context-actions.ts")
      ).toBe(Boolean(commerce && auth));
      expect(targets.includes("~/apps/web/lib/commerce-runtime.ts")).toBe(
        commerce
      );
      expect(
        targets.some(
          (target) =>
            target?.startsWith("~/apps/web/") &&
            /app-runtime|checkout|payments-stripe/u.test(target)
        )
      ).toBe(commerce);
      expect(
        targets.includes("~/apps/web/app/[locale]/checkout/page.tsx")
      ).toBe(commerce);
      expect(
        targets.includes("~/apps/api/app/checkout/[[...rest]]/route.ts")
      ).toBe(commerce);
      expect(plan.registryItems.includes(`cms-${cms}-product-collection`)).toBe(
        commerce
      );
      expect(
        rendered
          .get(`packages/cms-${cms}/components/component-registry.ts`)
          ?.includes("DynamicProductCollection")
      ).toBe(commerce);
      expect(
        rendered
          .get(`packages/cms-${cms}/components/pages/landing-page-query.ts`)
          ?.includes(
            cms === "drupal"
              ? "...DrupalDynamicProductCollection"
              : "...ProductCollectionBlock"
          )
      ).toBe(commerce);
      expect(
        plan.packageRequirements.some(
          (item) =>
            item.cwd === `packages/cms-${cms}` && item.name === "@repo/commerce"
        )
      ).toBe(commerce);
      expect(
        targets.some((target) =>
          target?.includes("blocks/dynamic-product-collection.tsx")
        )
      ).toBe(commerce);
      expect(
        rendered
          .get("apps/web/app/[locale]/layout.tsx")
          ?.includes("<AccountControls />")
      ).toBe(Boolean(auth));
      expect(
        rendered
          .get("apps/web/components/layout/document-shell.tsx")
          ?.includes("<AuthProvider>")
      ).toBe(Boolean(auth));
      expect(rendered.get("apps/web/proxy.ts")?.includes("authProxy(")).toBe(
        Boolean(auth)
      );
      expect(rendered.get("apps/web/env.ts")?.includes("@repo/auth/keys")).toBe(
        Boolean(auth)
      );
      expect(targets.includes("~/apps/web/lib/current-auth.ts")).toBe(commerce);
      expect(
        targets.includes(
          "~/apps/web/app/[locale]/sign-in/[[...sign-in]]/page.tsx"
        )
      ).toBe(auth === "clerk");
      expect(
        targets.includes("~/apps/web/app/api/auth/callback/route.ts")
      ).toBe(auth === "workos");
      expect(targets.some((target) => target?.includes("webhooks/clerk"))).toBe(
        auth === "clerk" && commerce
      );
      if (cms === "drupal") {
        expect(
          targets.includes(
            "~/packages/cms-drupal/canvas-components/product-collection/index.tsx"
          )
        ).toBe(commerce);
        expect(
          targets.includes(
            "~/apps/drupal/recipes/product-collection/recipe.yml"
          )
        ).toBe(commerce);
        const baseRecipe = artifacts
          .flatMap((item) => item.files ?? [])
          .find(
            (file) =>
              file.target ===
              "~/apps/drupal/recipes/next-hydra-starter/recipe.yml"
          );
        expect(baseRecipe?.content).not.toContain("dynamic_product_collection");
        expect(baseRecipe?.content).not.toContain("field_product_category");
      }
      expect(
        prepared.renderedFiles.every((file) => !file.content.includes("{{"))
      ).toBeTruthy();
    }
  );
});
