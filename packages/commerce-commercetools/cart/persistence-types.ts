import type {
  CheckoutContact,
  CheckoutDeliveryDetails,
  CheckoutScope,
} from "@repo/commerce/domain/checkout";
import type {
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import type { CurrencyCode } from "@repo/commerce/domain/money";
import type { StoreKey } from "@repo/commerce/store";
import type { Locale } from "@repo/i18n/types";
import type { CommercetoolsCart } from "./provider-cart";

export type AddToCartParams = {
  id: string;
  version: number;
  productId: string;
  variantId: number;
  quantity: number;
  locale: Locale;
};

export type AddToCartRepoParams = AddToCartParams & {
  storeKey: StoreKey;
};

export type CreateCartRepoParams = {
  locale: Locale;
  currency: CurrencyCode;
  storeKey: StoreKey;
};

export type CreateBusinessUnitCartRepoParams = {
  associateId: CommerceCustomerId;
  businessUnitKey: CommerceBusinessUnitKey;
  customerId: CommerceCustomerId;
  storeKey: StoreKey;
  locale: Locale;
  currency: CurrencyCode;
};

export type GetActiveCartForAssociateScopeParams = {
  associateId: CommerceCustomerId;
  businessUnitKey: CommerceBusinessUnitKey;
  storeKey: StoreKey;
  locale: Locale;
};

export type ChangeItemQuantityParams = {
  id: string;
  version: number;
  lineItemId: string;
  quantity: number;
  locale: Locale;
};

export type RemoveItemFromCartParams = Omit<
  ChangeItemQuantityParams,
  "quantity"
>;

export type SaveCheckoutContactParams = {
  cart: CommercetoolsCart;
  contact: CheckoutContact;
  locale: Locale;
  retryConcurrentModification?: boolean;
  scope: CheckoutScope;
};

export type SaveCheckoutDeliveryDetailsParams = {
  cart: CommercetoolsCart;
  deliveryDetails: CheckoutDeliveryDetails;
  locale: Locale;
  scope: CheckoutScope;
};
