import type { CommerceCustomerId } from "@repo/commerce/domain/commerce-account";
import type { CurrencyCode } from "@repo/commerce/domain/money";
import type { CategoryId, ProductSlug } from "@repo/commerce/product";
import type { CommerceLocale, StoreKey } from "@repo/commerce/store";
import { Context, Effect, Layer, Schema } from "effect";

export class CommercetoolsProductRequestFailure extends Schema.TaggedErrorClass<CommercetoolsProductRequestFailure>()(
  "CommercetoolsProductRequestFailure",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

export interface ResolveCommercetoolsProductContextInput {
  readonly storeKey: StoreKey;
  readonly locale: CommerceLocale;
  readonly customerId?: CommerceCustomerId;
}

export interface CommercetoolsProductContext {
  readonly distributionChannelId: string;
  readonly supplyChannelIds: readonly string[];
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

export interface CommercetoolsProductSelectionRule {
  readonly mode: "Individual" | "IndividualExclusion";
  readonly variantSelection: {
    readonly type: "includeOnly" | "includeAllExcept";
    readonly skus: readonly string[];
  } | null;
  readonly variantExclusion: { readonly skus: readonly string[] } | null;
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
  readonly getProductSelectionRules: (
    storeKey: StoreKey,
    productIds: readonly string[]
  ) => Effect.Effect<
    ReadonlyMap<string, readonly CommercetoolsProductSelectionRule[]>,
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
        resolveProductContext: (input) =>
          handlers.resolveProductContext?.(input) ??
          Effect.succeed({
            distributionChannelId: "",
            supplyChannelIds: [],
          }),
        findProductBySlug: (input) =>
          handlers.findProductBySlug?.(input) ?? Effect.succeed(null),
        listProductProjections: (input) =>
          handlers.listProductProjections?.(input) ?? Effect.succeed([]),
        getProductSelectionRules: (storeKey, productIds) =>
          handlers.getProductSelectionRules?.(storeKey, productIds) ??
          Effect.succeed(new Map()),
      })
    );
}
