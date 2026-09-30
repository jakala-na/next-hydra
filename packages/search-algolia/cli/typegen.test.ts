import path from "node:path";

import { storeConfiguration } from "@repo/commerce/store";
import { describe, expect, it } from "vitest";

import {
  buildAlgoliaCommercetoolsProductSource,
  readAlgoliaProductTypeSchemas,
} from "./typegen";

const schemaDirectory = path.join(
  process.cwd(),
  "../commerce-commercetools/schema/product-types"
);

describe(buildAlgoliaCommercetoolsProductSource, () => {
  it("derives connector Product fields from exported Product Type schemas", async () => {
    const schemas = await readAlgoliaProductTypeSchemas(schemaDirectory);
    const locales = storeConfiguration.map(({ locale }) => locale);
    const currencies = storeConfiguration.map(({ currency }) => currency);

    const source = buildAlgoliaCommercetoolsProductSource(
      schemas,
      locales,
      currencies
    );

    expect(source).toContain('readonly "capacity"?: number;');
    expect(source).toContain('readonly "model"?: number;');
    expect(source).toContain(
      'readonly "color"?: LocalizedStringByAlgoliaConnectorLocale;'
    );
    expect(source).toContain("export interface AlgoliaProductRecord {");
    expect(source).toContain(
      "export type AlgoliaProductFieldPath = FieldPath<AlgoliaProductRecord>;"
    );
    for (const locale of locales) {
      expect(source).toContain(`"${locale}"`);
    }
    for (const currency of currencies) {
      expect(source).toContain(`"${currency}"`);
    }
  });
});
