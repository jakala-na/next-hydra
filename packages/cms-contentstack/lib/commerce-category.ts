import { CategoryId } from "@repo/commerce/product";
import { Option, Schema } from "effect";

/** Contentstack custom field containing Commerce category references. */
const CommerceCategoryField = Schema.Struct({
  data: Schema.Array(Schema.Struct({ id: CategoryId })),
});

/**
 * `None` means a present CMS value is invalid. `Some(undefined)` means the CMS
 * entry has no category selection.
 */
export const decodeCommerceCategoryId = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the custom-field JSON boundary; decodeUnknownOption validates the CMS value before any field access.
  value: unknown
): Option.Option<CategoryId | undefined> => {
  if (value === null || value === undefined) {
    return Option.some(undefined);
  }

  return Schema.decodeUnknownOption(CommerceCategoryField)(value).pipe(
    Option.map((field) => field.data[0]?.id)
  );
};
