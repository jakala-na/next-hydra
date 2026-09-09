import { lstat, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { composeWorkspace } from "../src/compose.js";
import { loadSourceRegistryCatalog } from "../src/composition/catalog.js";
import { prepareComposition } from "../src/composition/install.js";
import { readPackageJson } from "../src/composition/packages.js";
import {
  planComposition,
  selectionFromPreset,
} from "../src/composition/planner.js";
import type { WorkspaceSelection } from "../src/composition/types.js";
import { pathExists } from "../src/fs-utils.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const commerceRoutes = [
  "apps/web/app/[locale]/checkout/page.tsx",
  "apps/web/app/[locale]/checkout/error.tsx",
  "apps/web/app/[locale]/checkout/orders/[orderId]/page.tsx",
  "apps/web/app/[locale]/product/[slug]/page.tsx",
  "apps/web/app/[locale]/account/page.tsx",
  "apps/web/app/[locale]/register/page.tsx",
  "apps/api/app/checkout/[[...rest]]/route.ts",
  "apps/api/app/address-book/route.ts",
  "apps/api/app/registrations/[[...rest]]/route.ts",
  "apps/admin/app/(workspace)/registration-approvals/page.tsx",
];

describe("whole-package composition", () => {
  let scratch: string;
  beforeAll(async () => {
    await mkdir(path.join(repoRoot, "workspaces"), { recursive: true });
    scratch = await mkdtemp(
      path.join(repoRoot, "workspaces", "whole-package-test-")
    );
  });

  afterAll(async () => {
    await rm(scratch, { force: true, recursive: true });
  });

  it("has one web application and no catalog-only selection", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot);
    expect(
      catalog.selections
        .filter(
          (item) => item.itemName === "app-web" && item.kind === "package"
        )
        .map((item) => item.itemName)
    ).toEqual(["app-web"]);
    expect(catalog.items.has("app-web-catalog")).toBeFalsy();
    expect(catalog.items.has("auth-workos-sign-in")).toBeFalsy();
    expect(catalog.items.has("auth-clerk-sign-in")).toBeFalsy();
    const standard = selectionFromPreset(catalog, "standard");
    const explicit = planComposition(catalog, standard);
    const implicit = planComposition(catalog, {
      addOns: standard.addOns,
      providers: standard.providers,
    });
    expect(implicit).toEqual(explicit);
  });

  it.each(
    ["contentstack", "drupal"].flatMap((cms) =>
      ["workos", "clerk"].map((auth) => ({ auth, cms }))
    )
  )(
    "$cms + $auth installs all Commerce routes as exact copies",
    async ({ cms, auth }) => {
      const catalog = await loadSourceRegistryCatalog(repoRoot);
      const plan = planComposition(catalog, {
        addOns: [],
        providers: { auth, cms, commerce: "commercetools" },
      });
      const prepared = await prepareComposition(catalog, plan);
      const selectedFiles = prepared.artifacts
        .filter((item) => plan.registryItems.includes(item.name))
        .flatMap((item) => item.files ?? []);
      await Promise.all(
        commerceRoutes.map(async (target) => {
          const installed = selectedFiles.filter(
            (file) => file.target === `~/${target}`
          );
          expect(installed).toHaveLength(1);
          expect(installed[0]?.content).toBe(
            await readFile(path.join(repoRoot, target), "utf-8")
          );
          expect(
            plan.templates.some((template) => template.target === target)
          ).toBeFalsy();
        })
      );
      const commerce = catalog.items.get("commerce");
      expect(commerce?.registryDependencies).toEqual(
        expect.arrayContaining([
          "commerce-web",
          "commerce-api",
          "commerce-admin",
        ])
      );
      expect(
        commerce?.files?.every((file) =>
          file.target?.startsWith("~/packages/commerce/")
        )
      ).toBeTruthy();
      expect(commerce?.files?.map((file) => file.target)).toEqual(
        expect.arrayContaining([
          "~/packages/commerce/checkout/checkout-page.tsx",
          "~/packages/commerce/cart/cart-provider.tsx",
          "~/packages/commerce/customer-account/index.ts",
        ])
      );
    }
  );

  it("keeps composed output out of the canonical source checkout", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot);
    const prepared = await prepareComposition(
      catalog,
      planComposition(catalog, selectionFromPreset(catalog, "standard"))
    );
    await Promise.all(
      prepared.renderedFiles.map(async (file) => {
        await expect(
          pathExists(path.join(repoRoot, file.target))
        ).resolves.toBeFalsy();
        await expect(
          pathExists(path.join(repoRoot, file.source))
        ).resolves.toBeTruthy();
      })
    );
  });

  it("supplies the web test command in the customer registry manifest", async () => {
    const catalog = await loadSourceRegistryCatalog(repoRoot);
    const plan = planComposition(
      catalog,
      selectionFromPreset(catalog, "standard")
    );
    const prepared = await prepareComposition(catalog, plan);
    const files = prepared.artifacts
      .filter((item) => plan.registryItems.includes(item.name))
      .flatMap((item) => item.files ?? []);
    const manifest = files.find(
      (file) => file.target === "~/apps/web/package.json"
    );
    expect(JSON.parse(manifest?.content ?? "{}")).toMatchObject({
      scripts: { test: "NODE_ENV=test vitest run --passWithNoTests" },
    });
    expect(
      files.some(
        (file) =>
          file.target?.startsWith("~/apps/web/") &&
          file.target.includes(".test.")
      )
    ).toBeTruthy();
  });

  it.each(
    ["clerk", "workos"].flatMap((auth) =>
      [false, true].map((commerce) => ({ auth, commerce }))
    )
  )(
    "$auth installs the customer-account contract only with Commerce=$commerce",
    async ({ auth, commerce }) => {
      const catalog = await loadSourceRegistryCatalog(repoRoot);
      const selection: WorkspaceSelection = {
        addOns: [],
        providers: {
          auth,
          cms: "contentstack",
        },
      };
      if (commerce) {
        selection.providers.commerce = "commercetools";
      }
      const plan = planComposition(catalog, selection);
      const prepared = await prepareComposition(catalog, plan);
      const files = prepared.artifacts
        .filter((item) => plan.registryItems.includes(item.name))
        .flatMap((item) => item.files ?? []);
      expect(
        files.some(
          (file) =>
            file.target ===
            `~/packages/auth-${auth}/testing/customer-account.test.ts`
        )
      ).toBe(commerce);
      expect(
        files.some(
          (file) => file.target === `~/packages/auth-${auth}/invitations.ts`
        )
      ).toBe(commerce);
      const owner = catalog.items.get(`auth-${auth}-commerce`);
      expect(
        owner?.files?.some(
          (file) =>
            file.target ===
            `~/packages/auth-${auth}/testing/customer-account.test.ts`
        )
      ).toBeTruthy();
    }
  );

  it("rejects Commerce without Auth before creating an output", async () => {
    const target = path.join(scratch, "invalid");
    await expect(
      composeWorkspace(target, {
        cms: "contentstack",
        commerce: "commercetools",
        install: false,
      })
    ).rejects.toThrow("requires an auth provider");
    await expect(pathExists(target)).resolves.toBeFalsy();
  });

  it("keeps Auth-only registration integrations absent and app-local configuration physical", async () => {
    const target = path.join(scratch, "auth-only");
    await composeWorkspace(target, {
      auth: "clerk",
      cms: "contentstack",
      install: false,
      linked: true,
    });
    const forbidden = [
      "packages/commerce",
      "packages/registration",
      "apps/api",
      "apps/admin",
    ];
    await expect(
      Promise.all(
        forbidden.map(
          async (entry) => await pathExists(path.join(target, entry))
        )
      )
    ).resolves.toEqual([false, false, false, false]);
    const config = await lstat(path.join(target, "apps/web/vitest.config.ts"));
    expect(config.isSymbolicLink()).toBeFalsy();
    const commands = await readFile(
      path.join(target, "apps/cli/src/program.ts"),
      "utf-8"
    );
    expect({
      auth: commands.includes("createAuthCommand"),
      cms: commands.includes("createCmsCommand"),
      commerce: commands.includes("createCommerceCommand"),
    }).toEqual({ auth: true, cms: true, commerce: false });
    const links = await readFile(
      path.join(target, "apps/web/components/layout/account-links.ts"),
      "utf-8"
    );
    expect({
      commerce: links.includes("commerceAccountLinks"),
      registration: links.includes("/register"),
    }).toEqual({ commerce: false, registration: false });
    const manifest = await readPackageJson(path.join(target, "package.json"));
    expect(manifest.devDependencies?.["@typescript/native"]).toBe(
      "catalog:typescript7"
    );
  });
});
