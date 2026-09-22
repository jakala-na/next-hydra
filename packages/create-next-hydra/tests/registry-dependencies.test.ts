import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RegistryItem } from "shadcn/schema";
import { afterEach, describe, expect, it, vi } from "vitest";

import { composeWorkspace } from "../src/compose.js";
// oxlint-disable-next-line import/no-namespace -- Spy on the shared catalog loader in both creation paths.
import * as catalogModule from "../src/composition/catalog.js";
import {
  installPreparedComposition,
  prepareComposition,
} from "../src/composition/install.js";
import type { PackageJson } from "../src/composition/packages.js";
import { readPackageJson } from "../src/composition/packages.js";
import { planComposition } from "../src/composition/planner.js";
import {
  applyRegistryDependencies,
  planRegistryDependencies,
} from "../src/composition/registry-dependencies.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const scratchDirectories: string[] = [];

function item(
  name: string,
  dependencies: string[] = [],
  devDependencies: string[] = []
): RegistryItem {
  return { dependencies, devDependencies, name, type: "registry:item" };
}

describe("standard registry npm dependencies", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      scratchDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      })
    );
  });

  it("keeps scoped packages, version ranges, tags and named aliases", () => {
    const manifest: PackageJson = {};
    applyRegistryDependencies(
      manifest,
      planRegistryDependencies([
        item(
          "addon",
          [
            "@scope/runtime@^2.0.0",
            "new-client",
            "compat@npm:other-client@1.2.3",
            "remote@https://example.test/library.tgz",
          ],
          ["tool@next"]
        ),
      ])
    );
    expect(manifest).toEqual({
      dependencies: {
        "@scope/runtime": "^2.0.0",
        compat: "npm:other-client@1.2.3",
        "new-client": "latest",
        remote: "https://example.test/library.tgz",
      },
      devDependencies: { tool: "next" },
    });
  });

  it("preserves installed bare-name requirements and prefers explicit versions", () => {
    const manifest: PackageJson = {
      dependencies: { existing: "catalog:" },
      devDependencies: { tool: "^1.0.0" },
    };
    applyRegistryDependencies(
      manifest,
      planRegistryDependencies([
        item("first", ["existing", "shared"], ["tool"]),
        item("second", [], ["shared@2.0.0"]),
      ])
    );
    expect(manifest).toEqual({
      dependencies: { existing: "catalog:", shared: "2.0.0" },
      devDependencies: { tool: "^1.0.0" },
    });
  });

  it("rejects conflicting explicit versions instead of picking an arbitrary item", () => {
    expect(() =>
      planRegistryDependencies([
        item("first", ["client@1"]),
        item("second", [], ["client@2"]),
      ])
    ).toThrow("Registry package dependencies conflict");
  });

  it.each([
    "https://example.test/library.tgz",
    "../local-package",
    "--ignore-scripts",
  ])(
    "rejects unnamed or unsafe requirement %s before materialization",
    (dependency) => {
      expect(() =>
        planRegistryDependencies([item("addon", [dependency])])
      ).toThrow("explicit package names");
    }
  );

  it("materializes the same selected requirements through customer and named-workspace paths without installing", async () => {
    const scratch = await mkdtemp(
      path.join(repoRoot, "workspaces", "registry-dependencies-test-")
    );
    scratchDirectories.push(scratch);
    const catalog = await catalogModule.loadSourceRegistryCatalog(repoRoot);
    const addon = catalog.items.get("app-web-navigation-search");
    if (!addon) {
      throw new Error("Missing navigation search fixture");
    }
    const child = item(
      "dependency-fixture",
      ["runtime-fixture@1.2.3"],
      ["@scope/tool-fixture@^2.0.0"]
    );
    catalog.items.set(child.name, child);
    catalog.itemByReference.set(child.name, child.name);
    catalog.items.set(addon.name, {
      ...addon,
      registryDependencies: [...(addon.registryDependencies ?? []), child.name],
    });
    // Unselected requirements must not leak from the full source catalog.
    catalog.items.set(
      "unselected-fixture",
      item("unselected-fixture", ["unselected-client@1"])
    );
    vi.spyOn(catalogModule, "loadSourceRegistryCatalog").mockResolvedValue(
      catalog
    );
    const plan = planComposition(catalog, {
      addOns: [addon.name],
      providers: { cms: "contentstack" },
    });
    const prepared = await prepareComposition(catalog, plan);
    const customer = path.join(scratch, "customer");
    await mkdir(customer);
    await writeFile(
      path.join(customer, "package.json"),
      JSON.stringify({ name: "customer", private: true })
    );
    await installPreparedComposition(customer, prepared);
    const development = path.join(scratch, "development");
    await composeWorkspace(
      development,
      { cms: "contentstack", install: false, search: true },
      {
        name: "dependency-check",
        report: () => undefined,
        sourceRoot: repoRoot,
      }
    );
    const customerManifest = await readPackageJson(
      path.join(customer, "package.json")
    );
    const developmentManifest = await readPackageJson(
      path.join(development, "package.json")
    );
    expect(customerManifest.dependencies).toEqual({
      "runtime-fixture": "1.2.3",
    });
    expect(developmentManifest.dependencies).toEqual(
      customerManifest.dependencies
    );
    expect(customerManifest.devDependencies).toEqual({
      "@scope/tool-fixture": "^2.0.0",
    });
    expect(developmentManifest.devDependencies?.["@scope/tool-fixture"]).toBe(
      customerManifest.devDependencies?.["@scope/tool-fixture"]
    );
  }, 30_000);
});
