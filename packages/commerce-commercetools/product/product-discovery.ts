import { CustomerCommercePrincipal } from "@repo/commerce/domain/commerce-request-context";
import {
  ProductDiscovery,
  ProductDiscoveryFailure,
} from "@repo/commerce/product";
import type { ProductCard, ProductDetail } from "@repo/commerce/product";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { Effect, Layer, Option } from "effect";

import { selectEligibleVariants } from "./catalog";
import { CommercetoolsProductDiscoveryClient } from "./client";
import { mapProductCard, mapProductDetail } from "./mapping";

const productDiscoveryImplementationLayer = Layer.effect(
  ProductDiscovery,
  Effect.gen(function* () {
    const commerceContext = yield* CommerceContext;
    const client = yield* CommercetoolsProductDiscoveryClient;

    const resolveProductContext = client.resolveProductContext({
      customerId:
        commerceContext.principal instanceof CustomerCommercePrincipal
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
          const rules = yield* client.getProductSelectionRules(
            commerceContext.store.storeKey,
            [product.id]
          );
          const eligibleVariants = selectEligibleVariants(
            product.allVariants,
            rules.get(product.id) ?? []
          );
          if (eligibleVariants.length === 0) {
            return Option.none<ProductDetail>();
          }

          return Option.some(
            yield* mapProductDetail(
              product,
              eligibleVariants,
              commerceContext.store.locale
            )
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
          const products = yield* client.listProductProjections({
            ...(input.categoryId === undefined
              ? {}
              : { categoryId: input.categoryId }),
            context,
            currency: commerceContext.store.currency,
            limit: input.limit,
            locale: commerceContext.store.locale,
          });
          const includedProducts = products.filter(
            ({ id }) => id !== input.excludeProductId
          );
          const rules = yield* client.getProductSelectionRules(
            commerceContext.store.storeKey,
            includedProducts.map(({ id }) => id)
          );
          const cards: ProductCard[] = [];

          for (const product of includedProducts) {
            const eligibleVariants = selectEligibleVariants(
              product.allVariants,
              rules.get(product.id) ?? []
            );
            if (eligibleVariants.length === 0) {
              continue;
            }
            const result = yield* mapProductCard(
              product,
              eligibleVariants
            ).pipe(Effect.result);
            if (result._tag === "Success") {
              cards.push(result.success);
            } else {
              yield* Effect.logWarning(
                "Omitting malformed Commercetools Product Card",
                { cause: result.failure, productId: product.id }
              );
            }
          }

          return cards
            .sort((left, right) =>
              left.title.localeCompare(
                right.title,
                commerceContext.store.locale
              )
            )
            .slice(0, input.limit);
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
    });
  })
);

export const productDiscoveryLayerWithClient = <E, R>(
  clientLayer: Layer.Layer<CommercetoolsProductDiscoveryClient, E, R>
) => productDiscoveryImplementationLayer.pipe(Layer.provide(clientLayer));
