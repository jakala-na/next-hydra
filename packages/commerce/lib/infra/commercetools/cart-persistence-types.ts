import type { Locale } from "@repo/i18n/types";
import type {
  CheckoutContact,
  CheckoutDeliveryDetails,
  CheckoutScope,
} from "../../../domain/checkout";
import type {
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "../../../domain/commerce-account";
import type { CurrencyCode } from "../../../domain/money";
import type { StoreKey } from "../../../store";
import type { Cart } from "../../types";

export type AddToCartParams = {
  id: string;
  version: number;
  productId: string;
  variantId: number;
  quantity: number;
  locale: Locale;
};

export type AddToCartRepoParams = AddToCartParams & {
  distributionChannelKey: string;
};

export type CreateCartRepoParams = {
  locale: Locale;
  currency: CurrencyCode;
  storeId: string;
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
  cart: Cart;
  contact: CheckoutContact;
  locale: Locale;
  retryConcurrentModification?: boolean;
  scope: CheckoutScope;
};

export type SaveCheckoutDeliveryDetailsParams = {
  cart: Cart;
  deliveryDetails: CheckoutDeliveryDetails;
  locale: Locale;
  scope: CheckoutScope;
};
