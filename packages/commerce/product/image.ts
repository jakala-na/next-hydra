import { Schema } from "effect";

export const ProductImageUrl = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      if (!URL.canParse(value)) {
        return false;
      }
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:";
    },
    { expected: "an absolute HTTP(S) URL" }
  )
).pipe(Schema.brand("ProductImageUrl"));
export type ProductImageUrl = typeof ProductImageUrl.Type;

export const ProductImage = Schema.Struct({
  altText: Schema.optional(Schema.String),
  url: ProductImageUrl,
});
export type ProductImage = typeof ProductImage.Type;
