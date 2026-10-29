import type { CommerceCustomerId } from "@repo/commerce/domain/commerce-account";
import type { CurrencyCode } from "@repo/commerce/domain/money";
import type { CategoryId, ProductSlug } from "@repo/commerce/product";
import type { CommerceLocale, StoreKey } from "@repo/commerce/store";
import { Context, Effect, Layer, Schema } from "effect";

export class CommercetoolsProductRequestFailure extends Schema.TaggedError<CommercetoolsProductRequestFailure>()(
  "CommercetoolsProductRequestFailure",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
  }
) {}

export interface ResolveCommercetoolsProductContextInput {
  readonly storeKey: StoreKey;
  readonly locale: CommerceLocale;
  readonly customerId?: CommerceCustomerId;
}

export interface CommercetoolsProductContext {
  readonly storeId: string;
  readonly distributionChannelId: string;
  readonly distributionChannelKey: string;
  readonly supplyChannelIds: readonly string[];
  readonly supplyChannelKeys: readonly string[];
  readonly customerGroupId?: string;
}

export interface FindCommercetoolsProductBySlugInput {
  readonly slug: ProductSlug;
  readonly locale: CommerceLocale;
  readonly currency: CurrencyCode;
  readonly context: CommercetoolsProductContext;
}

export interface ListCommercetoolsProductProjectionsInput {
  readonly categoryId?: CategoryId;
  readonly limit: number;
  readonly locale: CommerceLocale;
  readonly currency: CurrencyCode;
  readonly context: CommercetoolsProductContext;
}

export interface CommercetoolsMoney {
  readonly centAmount: number;
  readonly currencyCode: string;
}

export interface CommercetoolsProductPrice {
  readonly value: CommercetoolsMoney;
  readonly discounted: { readonly value: CommercetoolsMoney } | null;
}

export interface CommercetoolsProductAvailability {
  readonly channels: readonly {
    readonly availableQuantity: number | null;
  }[];
}

export interface CommercetoolsProductAttribute {
  readonly name: string;
  readonly value: unknown;
}

export interface CommercetoolsProductVariant {
  readonly id: number;
  readonly sku: string | null;
  readonly images: readonly {
    readonly url: string;
    readonly label: string | null;
  }[];
  readonly attributesRaw: readonly CommercetoolsProductAttribute[];
  readonly price: CommercetoolsProductPrice | null;
  readonly availability: CommercetoolsProductAvailability | null;
}

export interface CommercetoolsProductProjection {
  readonly id: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly slug: string | null;
  readonly categories: readonly {
    readonly id: string;
    readonly name: string | null;
    readonly slug: string | null;
  }[];
  readonly productType: { readonly key: string | null } | null;
  readonly masterVariant: {
    readonly images: readonly {
      readonly url: string;
      readonly label: string | null;
    }[];
  };
  readonly allVariants: readonly CommercetoolsProductVariant[];
}

interface CommercetoolsProductDiscoveryClientMethods {
  readonly resolveProductContext: (
    input: ResolveCommercetoolsProductContextInput
  ) => Effect.Effect<
    CommercetoolsProductContext,
    CommercetoolsProductRequestFailure
  >;
  readonly findProductBySlug: (
    input: FindCommercetoolsProductBySlugInput
  ) => Effect.Effect<
    CommercetoolsProductProjection | null,
    CommercetoolsProductRequestFailure
  >;
  readonly listProductProjections: (
    input: ListCommercetoolsProductProjectionsInput
  ) => Effect.Effect<
    readonly CommercetoolsProductProjection[],
    CommercetoolsProductRequestFailure
  >;
}

export class CommercetoolsProductDiscoveryClient extends Context.Service<
  CommercetoolsProductDiscoveryClient,
  CommercetoolsProductDiscoveryClientMethods
>()("@repo/commerce-commercetools/product/Client") {
  static readonly testLayer = (
    handlers: Partial<CommercetoolsProductDiscoveryClientMethods> = {}
  ) =>
    Layer.succeed(
      CommercetoolsProductDiscoveryClient,
      CommercetoolsProductDiscoveryClient.of({
        findProductBySlug: (input) =>
          handlers.findProductBySlug?.(input) ?? Effect.succeed(null),
        listProductProjections: (input) =>
          handlers.listProductProjections?.(input) ?? Effect.succeed([]),
        resolveProductContext: (input) =>
          handlers.resolveProductContext?.(input) ??
          Effect.succeed({
            distributionChannelId: "",
            distributionChannelKey: "",
            storeId: "",
            supplyChannelIds: [],
            supplyChannelKeys: [],
          }),
      })
    );
}
