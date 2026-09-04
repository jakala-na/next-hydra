import { CategoryId as CategoryIdSchema } from "@repo/commerce/product";
import type { CategoryId } from "@repo/commerce/product";
import { Option, Schema } from "effect";

/**
 * `None` means a present CMS value is invalid. `Some(undefined)` means
 * Contentful has no category selection and commerce should not apply a
 * category filter.
 */
export function decodeCommerceCategoryId(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Contentful GraphQL custom fields arrive untyped until the content model is generated.
  value: unknown
): Option.Option<CategoryId | undefined> {
  if (
    value === null ||
    value === undefined ||
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Empty strings are Contentful's absent-symbol before the field schema exists.
    (typeof value === "string" && value.trim() === "")
  ) {
    return Option.some(undefined);
  }

  return Schema.decodeUnknownOption(CategoryIdSchema)(value);
}
