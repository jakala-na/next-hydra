// This file is auto-generated. Do not edit manually.
// Run `pnpm cli commerce types generate` to regenerate.

import type { ProductAttribute } from "../types";

export type GenericProductAttributesSchema = Record<string, never>;

export type HeavyEarthmovingAndConstructionEquipmentAttributesSchema = {
  capacity: ProductAttribute<"number">;
  iso45001: ProductAttribute<"boolean">;
  relatedProducts: ProductAttribute<"text">[];
  mobility: ProductAttribute<"enum">;
  model: ProductAttribute<"number">;
};

export type HeavyLiftingAndSpecializedEquipmentAttributesSchema = {
  capacity: ProductAttribute<"number">;
  iso45001: ProductAttribute<"boolean">;
  relatedProducts: ProductAttribute<"text">[];
  mobility: ProductAttribute<"enum">;
  color: ProductAttribute<"lenum">;
};
