import { Context, Effect, Layer, Option, Schema } from "effect";

import type { ProductDetail } from "./generated/attributes";
import { CategoryId, ProductId } from "./identity";
import type { ProductSlug } from "./identity";
import type { ProductCard } from "./model";

export class ListProductCardsInput extends Schema.Class<ListProductCardsInput>(
  "ListProductCardsInput"
)({
  categoryId: Schema.optional(CategoryId),
  excludeProductId: Schema.optional(ProductId),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
}) {}

export const ProductDiscoveryOperation = Schema.Literals([
  "findBySlug",
  "listCards",
]);
export type ProductDiscoveryOperation = typeof ProductDiscoveryOperation.Type;

export class ProductDiscoveryFailure extends Schema.TaggedErrorClass<ProductDiscoveryFailure>()(
  "ProductDiscoveryFailure",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
    operation: ProductDiscoveryOperation,
  }
) {}

interface ProductDiscoveryMethods {
  readonly findBySlug: (
    slug: ProductSlug
  ) => Effect.Effect<Option.Option<ProductDetail>, ProductDiscoveryFailure>;
  readonly listCards: (
    input: ListProductCardsInput
  ) => Effect.Effect<readonly ProductCard[], ProductDiscoveryFailure>;
}

export type ProductDiscoveryTestHandlers = Partial<ProductDiscoveryMethods>;

export class ProductDiscovery extends Context.Service<
  ProductDiscovery,
  ProductDiscoveryMethods
>()("@repo/commerce/ProductDiscovery") {
  static readonly testLayer = (handlers: ProductDiscoveryTestHandlers = {}) =>
    Layer.succeed(
      ProductDiscovery,
      ProductDiscovery.of({
        findBySlug: Effect.fn("ProductDiscovery.findBySlug")(
          (slug) =>
            handlers.findBySlug?.(slug) ??
            Effect.succeed(Option.none<ProductDetail>())
        ),
        listCards: Effect.fn("ProductDiscovery.listCards")(
          (input) =>
            handlers.listCards?.(input) ??
            Effect.succeed<readonly ProductCard[]>([])
        ),
      })
    );
}
