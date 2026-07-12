import type { CurrencyCode, Locale } from "@repo/i18n/types";
import type {
  CheckoutContact,
  CheckoutDeliveryDetails,
} from "../../domain/checkout";
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
};

export type SaveCheckoutDeliveryDetailsParams = {
  cart: Cart;
  deliveryDetails: CheckoutDeliveryDetails;
  locale: Locale;
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
  getCustomerActiveCart(
    customerId: string,
    locale: Locale
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
  ): Promise<ActionResult<Cart>>;
  saveCheckoutDeliveryDetails(
    params: SaveCheckoutDeliveryDetailsParams
  ): Promise<ActionResult<Cart>>;
}

export interface CartService {
  getCustomerActiveCart(
    customerId: string,
    locale: Locale
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
  ): Promise<ActionResult<Cart>>;
  saveCheckoutDeliveryDetails(
    params: SaveCheckoutDeliveryDetailsParams
  ): Promise<ActionResult<Cart>>;
}
