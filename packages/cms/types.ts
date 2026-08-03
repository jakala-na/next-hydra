import type { LivePreviewHelper } from "@repo/cms/lib/utils/live-preview-helper";
import { CategoryId } from "@repo/commerce/product";
import type { Locale } from "@repo/i18n";
import { Schema } from "effect";

export type Maybe<T> = T | null;

export type Connection<T> = {
  edges: Edge<T>[];
};

export type Edge<T> = {
  node: T;
};

export type CMSLocale = Lowercase<Locale>;

export type ComponentBaseProps = {
  livePreviewHelper?: LivePreviewHelper;
};

/** CMS custom field containing Commerce category references. */
export const CommerceCategoryField = Schema.Struct({
  data: Schema.Array(Schema.Struct({ id: CategoryId })),
});
export type CommerceCategoryField = typeof CommerceCategoryField.Type;
