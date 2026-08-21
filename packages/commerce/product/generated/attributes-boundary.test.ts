// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { checkGeneratedProductAttributesSource } from "../../scripts/commerce-boundaries";

const commerceRoot = resolve(import.meta.dirname, "../..");
const artifactPath = resolve(import.meta.dirname, "attributes.ts");
const generatedArtifact = readFileSync(artifactPath, "utf8");

describe("generated Product Attributes", () => {
  it("is provider-neutral core code", () => {
    expect(
      checkGeneratedProductAttributesSource(
        generatedArtifact,
        artifactPath,
        commerceRoot
      )
    ).toEqual([]);
  });

  it("rejects relative imports that escape the core package", () => {
    expect(
      checkGeneratedProductAttributesSource(
        'export { secret } from "../../../commerce-commercetools/secret";',
        artifactPath,
        commerceRoot
      )
    ).toContain(
      "product/generated/attributes.ts imports non-core module ../../../commerce-commercetools/secret"
    );
  });
});
