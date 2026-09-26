import type { FieldPath } from "@repo/commerce/product";
import type { ProductFacetFieldMapping } from "@repo/search/product-contract";

import { algoliaProductFieldPath } from "./connector/commercetools/generated-product";
import type {
  AlgoliaConnectorCurrency,
  AlgoliaConnectorLocale,
  AlgoliaProductFieldPath,
  AlgoliaProductRecord,
} from "./connector/commercetools/generated-product";

export type AlgoliaProductFacetFields<
  PhysicalFieldPath extends string = AlgoliaProductFieldPath,
> = ProductFacetFieldMapping<PhysicalFieldPath>;

export const defineAlgoliaProductFacetFields =
  <Document>() =>
  (
    fields: ProductFacetFieldMapping<FieldPath<Document>>
  ): ProductFacetFieldMapping<FieldPath<Document>> =>
    fields;

export const algoliaProductFacetFields = (
  locale: AlgoliaConnectorLocale,
  currency: AlgoliaConnectorCurrency
): AlgoliaProductFacetFields =>
  defineAlgoliaProductFacetFields<AlgoliaProductRecord>()({
    availability: algoliaProductFieldPath("availability"),
    category: algoliaProductFieldPath(`category.${locale}`),
    price: algoliaProductFieldPath(`price.${currency}`),
  });

export { algoliaProductFieldPath } from "./connector/commercetools/generated-product";
