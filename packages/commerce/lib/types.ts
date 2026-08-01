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

export type ProductOptionType = "text" | "enum";

export type ProductOptionTextValue = {
  value: string;
};

export type ProductOptionEnumValue = {
  label: string;
  value: string;
};

export type ProductOptionValueByType<T extends ProductOptionType> =
  T extends "enum"
    ? ProductOptionEnumValue
    : T extends "text"
      ? ProductOptionTextValue
      : never;

export type ProductOption<T extends ProductOptionType = ProductOptionType> = {
  key: string;
  label: string;
  type: T;
  values: ProductOptionValueByType<T>[];
};

export type ProductVariant<TKey extends ProductTypeKey = ProductTypeKey> = {
  id: number;
  availableForSale: boolean;
  availableQuantity: number;
  attributes: ProductAttributes<TKey>;
  price: Price | null;
  images?: Image[];
};

export type SEO = {
  title: string;
  description: string;
  searchable: boolean;
};

export type ProductCardDTO = {
  id: string;
  slug?: string;
  featuredImage?: Image;
  title: string;
  description?: string;
  priceFrom?: number;
  currency?: string;
  availableForSale: boolean;
};

export type ProductDetailsDTO<TKey extends ProductTypeKey = ProductTypeKey> = {
  id: string;
  slug?: string;
  title: string;
  availableForSale: boolean;
  description: string;
  options: ProductOption[];
  variants: ProductVariant<TKey>[];
  masterVariant: ProductVariant<TKey>;
  attributes: ProductAttributes<TKey>;
  images?: Image[];
  seo: SEO;
  updatedAt: string | undefined | null;
  categories: {
    id: string;
    key: string | null;
    name: string | null;
    slug: string | null;
  }[];
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

export type ProductSelectionSetting = {
  active: boolean;
  productSelectionRef: {
    id: string;
  };
  productSelection: {
    id: string;
    key: string | null;
    mode: string;
  } | null;
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

export type Availability = {
  id: string | null;
  version: number | null;
  isOnStock: boolean;
  restockableInDays: number | null;
  availableQuantity: number | null;
};

export type AvailabilityWithChannels = {
  noChannel: Availability | null;
  channels: {
    results: {
      channel: Channel | null;
      availability: Availability;
    }[];
  };
};

export type ProductVariantAvailability = {
  availableForSale: boolean;
  availableQuantity: number;
};

export type AttributeRaw = {
  name: string;
  value: unknown;
};

export type ProductSearchVariant<TKey extends ProductTypeKey = ProductTypeKey> =
  {
    id: number;
    sku: string | null;
    attributes: ProductAttributes<TKey>;
    price: Price | null;
    availability: ProductVariantAvailability | null;
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
