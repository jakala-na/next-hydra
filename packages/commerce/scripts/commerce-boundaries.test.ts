import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkCommerceBoundaries,
  checkGeneratedProductAttributesSource,
  extractImportSpecifiers,
  isForbiddenCoreImport,
} from "./commerce-boundaries";

const repoRoot = resolve(import.meta.dirname, "../../..");

describe("Commerce provider boundaries", () => {
  it("accepts the repository's configured commerce boundary", () => {
    expect(checkCommerceBoundaries(repoRoot)).toEqual([]);
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
    ).toEqual(["one", "three", "two", "four", "five"]);
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

  it("recognizes forbidden core dependency subpaths", () => {
    expect(isForbiddenCoreImport("@urql/core/internal")).toBe(true);
    expect(isForbiddenCoreImport("gql.tada/runtime")).toBe(true);
    expect(isForbiddenCoreImport("wonka/lib/wonka")).toBe(true);
    expect(isForbiddenCoreImport("@repo/commerce/product")).toBe(false);
  });
});
