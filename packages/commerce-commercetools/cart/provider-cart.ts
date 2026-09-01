import type {
  CheckoutDetails,
  ShippingAddress,
} from "@repo/commerce/domain/checkout";
import type { CommerceBusinessUnitId } from "@repo/commerce/domain/commerce-account";
import type { CurrencyCode } from "@repo/commerce/domain/money";

import type { ProductAttributes, ProductTypeKey } from "./attributes";

export type CommercetoolsAddress = {
  readonly additionalStreetInfo?: string | null;
  readonly city?: string | null;
  readonly country: string;
  readonly key?: string | null;
  readonly postalCode?: string | null;
  readonly region?: string | null;
  readonly state?: string | null;
  readonly streetName?: string | null;
};

export type CommercetoolsMoney = {
  readonly centAmount: number;
  readonly currencyCode: CurrencyCode;
};

export type CommercetoolsPrice = {
  readonly value: CommercetoolsMoney;
  readonly discounted: {
    readonly value: CommercetoolsMoney | null;
  } | null;
};

export type CommercetoolsCart = {
  readonly id: string;
  readonly version: number;
  readonly customerId?: string;
  readonly businessUnitId?: CommerceBusinessUnitId;
  readonly customerEmail?: string | null;
  readonly store?: {
    readonly key: string | null;
  } | null;
  readonly custom?: {
    readonly type?: {
      readonly key: string;
    } | null;
    readonly customFieldsRaw?:
      | readonly {
          readonly name: string;
          readonly value: unknown;
        }[]
      | null;
  } | null;
  readonly lineItems: readonly CommercetoolsLineItem[];
  readonly totalLineItemQuantity: number;
  readonly totalPrice: CommercetoolsMoney;
  readonly checkoutDetails?: CheckoutDetails;
  readonly shippingAddress?: ShippingAddress | null;
  readonly itemShippingAddresses: readonly CommercetoolsAddress[];
  readonly shipping: readonly {
    readonly shippingAddress: CommercetoolsAddress;
    readonly shippingInfo: {
      readonly price: CommercetoolsMoney;
      readonly shippingMethodId?: string;
      readonly shippingMethodName: string;
      readonly shippingMethodState: "DoesNotMatchCart" | "MatchesCart";
    };
    readonly shippingKey: string;
  }[];
  readonly cartState: "Active" | "Merged" | "Ordered" | "Frozen";
  readonly shippingMode: "Single" | "Multiple";
};

export type CommercetoolsLineItem = {
  readonly id: string;
  readonly productId: string;
  readonly productType?: ProductTypeKey;
  readonly name?: string | null;
  readonly variant: {
    readonly id: number;
    readonly sku?: string;
    readonly images: readonly {
      readonly url: string;
      readonly altText: string;
    }[];
    readonly attributes: ProductAttributes;
  } | null;
  readonly price: CommercetoolsPrice;
  readonly quantity: number;
  readonly totalPrice: CommercetoolsMoney | null;
  readonly shippingDetails?: {
    readonly targets: readonly {
      readonly addressKey: string;
      readonly quantity: number;
      readonly shippingMethodKey?: string;
    }[];
    readonly valid: boolean;
  } | null;
};
