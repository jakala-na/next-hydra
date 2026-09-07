/* oxlint-disable effecttsgo/node-builtin-import -- This artifact-integrity test reads the same local source file consumed by the Node-based generator. */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { ALGOLIA_COMMERCETOOLS_TRANSFORMATION_SOURCE } from "../connector/commercetools/generated-transform";
import { buildAlgoliaCommercetoolsTransformationSource } from "./transform-generator";

describe(buildAlgoliaCommercetoolsTransformationSource, () => {
  it("produces standalone Algolia JavaScript from the typed transformation", async () => {
    const source = await readFile(
      path.join(process.cwd(), "connector/commercetools/transform.ts"),
      "utf-8"
    );
    const generated = buildAlgoliaCommercetoolsTransformationSource(source);
    expect(ALGOLIA_COMMERCETOOLS_TRANSFORMATION_SOURCE).toBe(generated);
    const result: unknown = await runInNewContext(
      `${ALGOLIA_COMMERCETOOLS_TRANSFORMATION_SOURCE}; transform(record, helper)`,
      {
        helper: {
          secrets: {
            get: (name: string) =>
              name === "CONFIGURATION"
                ? JSON.stringify({
                    priceCustomerGroupIds: ["contractors-id"],
                    version: 4,
                  })
                : undefined,
          },
        },
        record: {
          name: { "en-US": "Excavator" },
          objectID: "product-1",
          slug: { "en-US": "excavator" },
          variants: [
            {
              id: "variant-1",
              prices: {
                USD: {
                  min: 8000,
                  priceValues: [
                    { id: "public", value: 10_000 },
                    {
                      customerGroupID: "contractors-id",
                      id: "contractors",
                      value: 8000,
                    },
                  ],
                },
              },
            },
          ],
        },
      },
      { timeout: 1000 }
    );

    expect(generated).toContain("async function transform(");
    expect(generated).not.toMatch(
      /\b(?:declare|export|import|interface|type)\b/u
    );
    expect(result).toMatchObject([
      {
        objectID: "product-1",
        price: { USD: 100 },
        priceAudienceIds: ["public"],
      },
      {
        objectID: "product-1--contractors-id",
        price: { USD: 80 },
        priceAudienceIds: ["contractors-id"],
      },
    ]);
  });
});
