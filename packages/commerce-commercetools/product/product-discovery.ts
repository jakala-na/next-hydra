import { CustomerCommercePrincipal } from "@repo/commerce/domain/commerce-request-context";
import {
  type ProductCard,
  type ProductDetail,
  ProductDiscovery,
  ProductDiscoveryFailure,
} from "@repo/commerce/product";
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
      storeKey: commerceContext.store.storeKey,
      locale: commerceContext.store.locale,
      customerId:
        commerceContext.principal instanceof CustomerCommercePrincipal
          ? commerceContext.principal.customerId
          : undefined,
    });

    return ProductDiscovery.of({
      findBySlug: Effect.fn("ProductDiscovery.findBySlug")((slug) =>
        Effect.gen(function* () {
          const context = yield* resolveProductContext;
          const product = yield* client.findProductBySlug({
            slug,
            locale: commerceContext.store.locale,
            currency: commerceContext.store.currency,
            context,
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
                operation: "findBySlug",
                message: "Commercetools Product detail discovery failed",
                cause,
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
            limit: input.limit,
            locale: commerceContext.store.locale,
            currency: commerceContext.store.currency,
            context,
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
                { productId: product.id, cause: result.failure }
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
                operation: "listCards",
                message: "Commercetools Product card discovery failed",
                cause,
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
