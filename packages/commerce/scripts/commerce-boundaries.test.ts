// @vitest-environment node

import nodePath from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkApplicationRuntimeBindingSource,
  checkCommerceBoundaries,
  checkGeneratedProductAttributesSource,
  extractImportSpecifiers,
  repositoryFiles,
} from "./commerce-boundaries";

const repoRoot = nodePath.resolve(import.meta.dirname, "../../..");

describe("Commerce provider boundaries", () => {
  it("inspects physical and linked source files regardless of Git tracking", () => {
    const files = repositoryFiles(repoRoot);
    expect(files).toContain(
      nodePath.resolve(
        repoRoot,
        "packages/commerce/services/customer-account-members.ts"
      )
    );
    expect(files).toContain(
      nodePath.resolve(repoRoot, "packages/commerce/package.json")
    );
    expect(files.some((file) => file.includes("/node_modules/"))).toBeFalsy();
  });

  it("accepts the repository's configured commerce boundary", () => {
    expect(checkCommerceBoundaries(repoRoot)).toStrictEqual([]);
  });

  it("recognizes static, side-effect, dynamic, and CommonJS imports", () => {
    expect(
      extractImportSpecifiers(`
        import { one } from "one";
        import "two";
        export { three } from "three";
        const four = import("four");
        const five = require("five");
      `)
    ).toStrictEqual(["one", "three", "two", "four", "five"]);
  });

  it("rejects forbidden package subpaths in generated artifacts", () => {
    const wonkaSubpath = ["wonka", "lib", "wonka"].join("/");
    expect(
      checkGeneratedProductAttributesSource(
        `export { pipe } from "${wonkaSubpath}";`,
        "/repo/packages/commerce/product/generated/attributes.ts",
        "/repo/packages/commerce"
      )
    ).toContain(
      `product/generated/attributes.ts imports non-core module ${wonkaSubpath}`
    );
  });

  it("requires package-owned actions to use the application runtime alias", () => {
    expect(
      checkApplicationRuntimeBindingSource(
        'import { CommerceActions } from "../runtime";',
        "customer-account/actions.ts"
      )
    ).toContain(
      "customer-account/actions.ts must import the application-selected @repo/commerce/runtime binding"
    );
    expect(
      checkApplicationRuntimeBindingSource(
        'import { CommerceActions } from "@repo/commerce/runtime";',
        "customer-account/actions.ts"
      )
    ).toStrictEqual([]);
  });
});
