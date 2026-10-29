import { CustomerCommercePrincipal } from "@repo/commerce/domain/commerce-request-context";
import {
  ProductDiscovery,
  ProductDiscoveryFailure,
} from "@repo/commerce/product";
import type { ProductCard, ProductDetail } from "@repo/commerce/product";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { Effect, Layer, Option, Schema } from "effect";

import { CommercetoolsProductDiscoveryClient } from "./client";
import { mapProductCard, mapProductDetail } from "./mapping";

const productDiscoveryImplementationLayer = Layer.effect(
  ProductDiscovery,
  Effect.gen(function* () {
    const commerceContext = yield* CommerceContext;
    const client = yield* CommercetoolsProductDiscoveryClient;

    const resolveProductContext = client.resolveProductContext({
      customerId: Schema.is(CustomerCommercePrincipal)(
        commerceContext.principal
      )
        ? commerceContext.principal.customerId
        : undefined,
      locale: commerceContext.store.locale,
      storeKey: commerceContext.store.storeKey,
    });

    return ProductDiscovery.of({
      findBySlug: Effect.fn("ProductDiscovery.findBySlug")((slug) =>
        Effect.gen(function* () {
          const context = yield* resolveProductContext;
          const product = yield* client.findProductBySlug({
            context,
            currency: commerceContext.store.currency,
            locale: commerceContext.store.locale,
            slug,
          });

          if (product === null) {
            return Option.none<ProductDetail>();
          }
          if (product.allVariants.length === 0) {
            return Option.none<ProductDetail>();
          }

          return Option.some(
            yield* mapProductDetail(product, commerceContext.store.locale)
          );
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ProductDiscoveryFailure({
                cause,
                message: "Commercetools Product detail discovery failed",
                operation: "findBySlug",
              })
          )
        )
      ),
      listCards: Effect.fn("ProductDiscovery.listCards")((input) =>
        Effect.gen(function* () {
          const context = yield* resolveProductContext;
          const listInput = {
            context,
            currency: commerceContext.store.currency,
            limit: input.limit,
            locale: commerceContext.store.locale,
          };
          const products = yield* client.listProductProjections(
            input.categoryId === undefined
              ? listInput
              : { ...listInput, categoryId: input.categoryId }
          );
          const includedProducts = products.filter(
            ({ id }) => id !== input.excludeProductId
          );
          const cards: ProductCard[] = [];

          for (const product of includedProducts) {
            if (product.allVariants.length === 0) {
              continue;
            }
            const result = yield* mapProductCard(product).pipe(Effect.result);
            if (result._tag === "Success") {
              cards.push(result.success);
            } else {
              yield* Effect.logWarning(
                "Omitting malformed Commercetools Product Card",
                { cause: result.failure, productId: product.id }
              );
            }
          }

          return (
            cards
              // oxlint-disable-next-line unicorn/no-array-sort -- This package targets ES2022; cards is a new local array.
              .sort((left, right) =>
                left.title.localeCompare(
                  right.title,
                  commerceContext.store.locale
                )
              )
              .slice(0, input.limit)
          );
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ProductDiscoveryFailure({
                cause,
                message: "Commercetools Product card discovery failed",
                operation: "listCards",
              })
          )
        )
      ),
      searchAudience: Effect.fn("ProductDiscovery.searchAudience")(() =>
        resolveProductContext.pipe(
          Effect.map((context) => ({
            priceAudienceIds:
              context.customerGroupId === undefined
                ? []
                : [context.customerGroupId],
          })),
          Effect.mapError(
            (cause) =>
              new ProductDiscoveryFailure({
                cause,
                message: "Commercetools Product search audience failed",
                operation: "searchAudience",
              })
          )
        )
      ),
    });
  })
);

export const productDiscoveryLayerWithClient = <E, R>(
  clientLayer: Layer.Layer<CommercetoolsProductDiscoveryClient, E, R>
) => productDiscoveryImplementationLayer.pipe(Layer.provide(clientLayer));
