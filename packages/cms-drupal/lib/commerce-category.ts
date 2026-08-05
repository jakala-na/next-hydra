import {
  type CategoryId,
  CategoryId as CategoryIdSchema,
} from "@repo/commerce/product";
import { Option, Schema } from "effect";

/**
 * `None` means a present CMS value is invalid. `Some(undefined)` means Drupal
 * has no category selection and commerce should not apply a category filter.
 */
export function decodeCommerceCategoryId(
  value: unknown
): Option.Option<CategoryId | undefined> {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return Option.some(undefined);
  }

  return Schema.decodeUnknownOption(CategoryIdSchema)(value);
}
