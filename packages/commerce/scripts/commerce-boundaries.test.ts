// @vitest-environment node

import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkCommerceBoundaries,
  checkGeneratedProductAttributesSource,
  extractImportSpecifiers,
} from "./commerce-boundaries";

const repoRoot = resolve(import.meta.dirname, "../../..");

describe("Commerce provider boundaries", () => {
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
});
