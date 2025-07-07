export type Maybe<T> = T | null;

export type Connection<T> = {
  edges: Edge<T>[];
  total: number;
};

export type Edge<T> = {
  node: T;
};

export type Image = {
  url: string;
  altText?: string;
  width?: number;
  height?: number;
};

export type Money = {
  centAmount: number;
  currencyCode: string;
  fractionDigits: number;
};

export type Product = {
  id: string;
  key?: string;
  version: number;
  masterData: {
    current: ProductData;
    staged: ProductData;
  };
};

export type ProductData = {
  name: string;
  description?: string;
  slug: string;
  masterVariant: ProductVariant;
  variants: ProductVariant[];
};

export type ProductVariant = {
  id: number;
  sku?: string;
  key?: string;
  images: Image[];
  prices: Price[];
  attributes: Attribute[];
};

export type Price = {
  id: string;
  value: Money;
  country?: string;
  customerGroup?: {
    id: string;
  };
  channel?: {
    id: string;
  };
};

export type Attribute = {
  name: string;
  value: unknown;
};

export type Cart = {
  id: string;
  version: number;
  customerId?: string;
  anonymousId?: string;
  lineItems: LineItem[];
  customLineItems: CustomLineItem[];
  totalPrice: Money;
  taxedPrice?: {
    totalNet: Money;
    totalGross: Money;
  };
  cartState: 'Active' | 'Merged' | 'Ordered';
  origin: 'Customer' | 'Merchant';
};

export type LineItem = {
  id: string;
  productId: string;
  productKey?: string;
  name: string;
  productSlug?: string;
  variant: ProductVariant;
  price: Price;
  quantity: number;
  totalPrice: Money;
  state: LineItemState[];
};

export type CustomLineItem = {
  id: string;
  name: string;
  money: Money;
  slug: string;
  quantity: number;
  totalPrice: Money;
  state: LineItemState[];
};

export type LineItemState = {
  quantity: number;
  state: {
    id: string;
    key?: string;
  };
};

export type CartDraft = {
  currency: string;
  customerId?: string;
  anonymousId?: string;
  country?: string;
  inventoryMode?: 'TrackOnly' | 'ReserveOnOrder' | 'None';
  taxMode?: 'Platform' | 'External' | 'ExternalAmount' | 'Disabled';
  taxRoundingMode?: 'HalfEven' | 'HalfUp' | 'HalfDown';
  taxCalculationMode?: 'LineItemLevel' | 'UnitPriceLevel';
  lineItems?: LineItemDraft[];
  customLineItems?: CustomLineItemDraft[];
  shippingAddress?: Address;
  billingAddress?: Address;
  shippingMethod?: {
    id: string;
  };
  locale?: string;
  origin?: 'Customer' | 'Merchant';
  deleteDaysAfterLastModification?: number;
};

export type LineItemDraft = {
  productId?: string;
  productKey?: string;
  variantId?: number;
  sku?: string;
  quantity: number;
  addedAt?: string;
  distributionChannel?: {
    id: string;
  };
  supplyChannel?: {
    id: string;
  };
};

export type CustomLineItemDraft = {
  name: string;
  quantity: number;
  money: Money;
  slug: string;
  taxCategory?: {
    id: string;
  };
};

export type Address = {
  id?: string;
  key?: string;
  title?: string;
  salutation?: string;
  firstName?: string;
  lastName?: string;
  streetName?: string;
  streetNumber?: string;
  additionalStreetInfo?: string;
  postalCode?: string;
  city?: string;
  region?: string;
  state?: string;
  country: string;
  company?: string;
  department?: string;
  building?: string;
  apartment?: string;
  pOBox?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  fax?: string;
  additionalAddressInfo?: string;
  externalId?: string;
};

export type AddToCartInput = {
  productId?: string;
  productKey?: string;
  variantId?: number;
  sku?: string;
  quantity: number;
};

export type UpdateCartInput = {
  cartId: string;
  version: number;
  actions: CartUpdateAction[];
};

export type CartUpdateAction = 
  | AddLineItemAction
  | RemoveLineItemAction
  | ChangeLineItemQuantityAction
  | SetShippingAddressAction
  | SetBillingAddressAction;

export type AddLineItemAction = {
  action: 'addLineItem';
  productId?: string;
  productKey?: string;
  variantId?: number;
  sku?: string;
  quantity: number;
};

export type RemoveLineItemAction = {
  action: 'removeLineItem';
  lineItemId: string;
  quantity?: number;
};

export type ChangeLineItemQuantityAction = {
  action: 'changeLineItemQuantity';
  lineItemId: string;
  quantity: number;
};

export type SetShippingAddressAction = {
  action: 'setShippingAddress';
  address?: Address;
};

export type SetBillingAddressAction = {
  action: 'setBillingAddress';
  address?: Address;
};