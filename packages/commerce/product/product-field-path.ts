import type { FieldPath } from "./field-path";
import type {
  ProductAttributePath,
  ProductDetail,
} from "./generated/attributes";

type GeneratedProductFieldPath = FieldPath<ProductDetail>;

/** Product paths whose Attribute members come from generated Product Types. */
export type ProductFieldPath =
  | Exclude<GeneratedProductFieldPath, `variants.attributes.${string}`>
  | `variants.attributes.${ProductAttributePath}`;

/** Keeps domain field paths literal while checking them against Product Detail. */
export const productFieldPath = <Path extends ProductFieldPath>(path: Path) =>
  path;
