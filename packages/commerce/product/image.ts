import { Schema } from "effect";

export const ProductImageUrl = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      if (!URL.canParse(value)) {
        return false;
      }
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    },
    { expected: "an absolute HTTP(S) URL" }
  )
).pipe(Schema.brand("ProductImageUrl"));
export type ProductImageUrl = typeof ProductImageUrl.Type;

export const ProductImage = Schema.Struct({
  url: ProductImageUrl,
  altText: Schema.optional(Schema.String),
});
export type ProductImage = typeof ProductImage.Type;
