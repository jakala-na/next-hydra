import type { CurrencyCode, Locale } from "@repo/i18n/types";
import type { StoreKey } from "../../domain/cart";
import type {
  CheckoutContact,
  CheckoutDeliveryDetails,
  CheckoutScope,
} from "../../domain/checkout";
import type {
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "../../domain/commerce-account";
import type { Cart } from "../types";
import type { ActionResult } from "../utils/errors";
import type { PolicyViolation } from "./policy/cart-policy.types";

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

export type GetActiveCartForAssociateScopeParams = {
  associateId: CommerceCustomerId;
  businessUnitKey: CommerceBusinessUnitKey;
  storeKey: StoreKey;
  locale: Locale;
};

export type GetActiveCartForAssociateScopeServiceParams = Omit<
  GetActiveCartForAssociateScopeParams,
  "storeKey"
>;

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
  scope: CheckoutScope;
};

export type SaveCheckoutDeliveryDetailsParams = {
  cart: Cart;
  deliveryDetails: CheckoutDeliveryDetails;
  locale: Locale;
  scope: CheckoutScope;
};

/**
 * Cart with policy validation issues
 */
export type CartWithIssues = {
  cart: Cart;
  issues: PolicyViolation[];
  currency: CurrencyCode;
};

export interface CartRepository {
  getActiveCartForAssociateScope(
    params: GetActiveCartForAssociateScopeParams
  ): Promise<ActionResult<Cart>>;
  getCartById(id: string, locale: Locale): Promise<ActionResult<Cart>>;
  createCart(params: CreateCartRepoParams): Promise<ActionResult<Cart>>;
  addItemToCart(params: AddToCartRepoParams): Promise<ActionResult<Cart>>;
  changeItemQuantity(
    params: ChangeItemQuantityParams
  ): Promise<ActionResult<Cart>>;
  removeItemFromCart(
    params: RemoveItemFromCartParams
  ): Promise<ActionResult<Cart>>;
  saveCheckoutContact(
    params: SaveCheckoutContactParams
  ): Promise<ActionResult<void>>;
  saveCheckoutDeliveryDetails(
    params: SaveCheckoutDeliveryDetailsParams
  ): Promise<ActionResult<void>>;
}

export interface CartService {
  getActiveCartForAssociateScope(
    params: GetActiveCartForAssociateScopeServiceParams
  ): Promise<ActionResult<Cart>>;
  getCartById(id: string, locale: Locale): Promise<ActionResult<Cart>>;
  createCart({ locale }: { locale: Locale }): Promise<ActionResult<Cart>>;
  addItemToCart(params: AddToCartParams): Promise<ActionResult<Cart>>;
  changeItemQuantity(
    params: ChangeItemQuantityParams
  ): Promise<ActionResult<Cart>>;
  removeItemFromCart(
    params: RemoveItemFromCartParams
  ): Promise<ActionResult<Cart>>;
  saveCheckoutContact(
    params: SaveCheckoutContactParams
  ): Promise<ActionResult<void>>;
  saveCheckoutDeliveryDetails(
    params: SaveCheckoutDeliveryDetailsParams
  ): Promise<ActionResult<void>>;
}
