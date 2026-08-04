import type { CategoryId } from "@repo/commerce/product";
import { Option, Schema } from "effect";
import { CommerceCategoryField } from "../types";

/**
 * `None` means a present CMS value is invalid. `Some(undefined)` means the CMS
 * entry has no category selection.
 */
export const decodeCommerceCategoryId = (
  value: unknown
): Option.Option<CategoryId | undefined> => {
  if (value === null || value === undefined) {
    return Option.some(undefined);
  }

  return Schema.decodeUnknownOption(CommerceCategoryField)(value).pipe(
    Option.map((field) => field.data[0]?.id)
  );
};
