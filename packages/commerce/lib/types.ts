import type {
  ProductAttributes,
  ProductTypeKey,
} from "@repo/commerce/lib/product/mappers/attributes.ts";
import type { CurrencyCode } from "@repo/i18n/types";
import type { CheckoutDetails, ShippingAddress } from "../domain/checkout";
import type { CommerceBusinessUnitId } from "../domain/commerce-account";

// Define price explicitly since it's coming from potentially different fragments.
export type Price = {
  value: Money;
  country?: string;
  customerGroup?: {
    id: string;
  };
  channel?: {
    id: string;
  };
  discounted: {
    value: Money | null;
  } | null;
};

export type Image = {
  url: string;
  altText: string;
};

export type Money = {
  centAmount: number;
  currencyCode: CurrencyCode;
};

export type Channel = {
  id: string;
  key: string;
  version: number;
  name: string | null;
};

export type Country = {
  code: string;
};

export type Store = {
  id: string;
  key: string;
  version: number;
  name: string | null;
  languages: string[] | null;
  countries: Country[] | null;
  distributionChannels: Channel[];
  supplyChannels: Channel[];
};

export type AttributeRaw = {
  name: string;
  value: unknown;
};

export type Cart = {
  id: string;
  version: number;
  customerId?: string;
  businessUnitId?: CommerceBusinessUnitId;
  customerEmail?: string | null;
  anonymousId?: string;
  store?: {
    key: string | null;
  } | null;
  custom?: {
    type?: {
      key: string;
    } | null;
    customFieldsRaw?:
      | readonly {
          name: string;
          value: unknown;
        }[]
      | null;
  } | null;
  lineItems: LineItem[];
  totalLineItemQuantity: number;
  totalPrice: Money;
  checkoutDetails?: CheckoutDetails;
  shippingAddress?: ShippingAddress | null;
  taxedPrice?: {
    totalNet: Money;
    totalGross: Money;
  };
  cartState: "Active" | "Merged" | "Ordered" | "Frozen";
  origin?: "Customer" | "Merchant";
  weight?: {
    value: number;
    unit: "lb" | "kg";
  };
};

export type LineItem = {
  id: string;
  productId: string;
  productType?: ProductTypeKey;
  productKey?: string;
  name?: string | null;
  productSlug?: string;
  variant: CartLineItemVariant | null;
  price: Price;
  quantity: number;
  totalPrice: Money | null;
  // state: LineItemState[]; // TODO: Implement later.
};

export type CartLineItemVariant<TKey extends ProductTypeKey = ProductTypeKey> =
  {
    id: number;
    sku?: string;
    images: Image[];
    attributes: ProductAttributes<TKey>;
  };
