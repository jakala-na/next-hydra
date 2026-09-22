/* oxlint-disable vitest/max-expects -- Each fixture checks the complete capability exclusion contract. */
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { loadSourceRegistryCatalog } from "../src/composition/catalog.js";
import { prepareComposition } from "../src/composition/install.js";
import { planComposition } from "../src/composition/planner.js";
import type { WorkspaceSelection } from "../src/composition/types.js";
import { pathExists } from "../src/fs-utils.js";
import { scaffoldProject } from "../src/scaffold.js";
import { createSourceRepository } from "./fixtures/source-repository.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("backend ownership", () => {
  it.each(["clerk", "workos"])(
    "the full %s storefront installs API through the registry",
    async (auth) => {
      const catalog = await loadSourceRegistryCatalog(repoRoot);
      const plan = planComposition(catalog, {
        addOns: [],
        providers: { auth, cms: "contentstack", commerce: "commercetools" },
      });
      expect(plan.registryItems).toContain("commerce-api");
      const prepared = await prepareComposition(catalog, plan);
      const backend = prepared.artifacts.find(
        (item) => item.name === "commerce-api"
      );
      const targets = backend?.files?.map((file) => file.target) ?? [];
      expect(targets).toEqual(
        expect.arrayContaining([
          "~/apps/api/package.json",
          "~/apps/api/app/checkout/[[...rest]]/route.ts",
          "~/apps/api/app/address-book/route.ts",
          "~/apps/api/app/registrations/[[...rest]]/route.ts",
        ])
      );
      // Auth keeps ownership of its webhook; the backend must not claim its copy.
      expect(
        targets.some((target) => target?.includes("/webhooks/"))
      ).toBeFalsy();
      expect(plan.packageRequirements).toContainEqual({
        cwd: "apps/api",
        name: "@repo/auth",
        section: "dependencies",
        specifier: `workspace:@repo/auth-${auth}@*`,
      });
    }
  );

  it.each([false, true])(
    "Commerce=%s owns the backend independently of navigation search",
    async (commerce) => {
      const catalog = await loadSourceRegistryCatalog(
        repoRoot,
        "registry.json"
      );
      const selection: WorkspaceSelection = {
        addOns: ["app-web-navigation-search"],
        providers: {
          auth: "auth-clerk",
          cms: "contentstack",
        },
      };
      if (commerce) {
        selection.providers.commerce = "commercetools";
      }
      const plan = planComposition(catalog, selection);
      expect(plan.registryItems.includes("commerce-api")).toBe(commerce);
      const prepared = await prepareComposition(catalog, plan);
      expect(
        prepared.artifacts
          .filter((item) => plan.registryItems.includes(item.name))
          .flatMap((item) => item.files ?? [])
          .some((file) => file.target?.startsWith("~/apps/api/"))
      ).toBe(commerce);
    }
  );
});

describe("customer CMS package exclusions", () => {
  let scratch: string;
  beforeAll(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "composition-gaps-test-"));
    await createSourceRepository(repoRoot, path.join(scratch, "source"));
  });

  afterAll(async () => {
    // Only this suite's uniquely created outputs, never an existing workspace.
    await rm(scratch, { force: true, recursive: true });
  });

  it.each(["contentstack", "drupal"])(
    "%s removes reference-only imports and authoring inputs",
    async (cms) => {
      const targetRoot = path.join(scratch, cms);
      await scaffoldProject(
        {
          cms,
          commit: false,
          repoUrl: path.join(scratch, "source"),
          skipGit: true,
          targetDir: targetRoot,
          verbose: false,
          without: ["auth", "commerce"],
          yes: true,
        },
        { install: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) }
      );

      const excludedTargets = [
        "apps/api",
        "apps/admin",
        "apps/web/site-shell",
        "apps/web/registry",
        "apps/web/components/layout/header-cart.tsx",
        "apps/web/components/layout/header-business-unit.tsx",
        "apps/web/components/layout/account-menu.tsx",
        "apps/web/components/layout/header-search.tsx",
        "apps/web/lib/catalog-runtime.ts",
        "apps/web/lib/cart-actions.ts",
        "packages/commerce",
        "packages/registration",
        "packages/payments-stripe",
      ];
      await Promise.all(
        excludedTargets.map(async (target) => {
          expect({
            exists: await pathExists(path.join(targetRoot, target)),
            target,
          }).toEqual({ exists: false, target });
        })
      );
      const web = path.join(targetRoot, "apps/web");
      const inventory = await readdir(web, { recursive: true });
      const sourceFiles = inventory.filter((file) =>
        /\.[cm]?[jt]sx?$/u.test(file)
      );
      await Promise.all(
        sourceFiles.map(async (file) => {
          const source = await readFile(path.join(web, file), "utf-8");
          const forbiddenImport =
            /(?:from\s*|import\s*\(?\s*)["']@repo\/(?:auth(?:\/|["'])|commerce|registration|payments)/u.exec(
              source
            );
          expect({ file, forbiddenImport }).toEqual({
            file,
            forbiddenImport: null,
          });
        })
      );
    },
    30_000
  );
});
