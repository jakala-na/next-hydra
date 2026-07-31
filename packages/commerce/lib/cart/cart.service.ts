import type { Locale } from "@repo/i18n/types";
import { StoreKey } from "../../domain/cart";
import { storeService } from "../store/store.service";
import type { Cart } from "../types";
import type { ActionResult } from "../utils/errors";
import { cartRepo } from "./cart.repo";
import type {
  AddToCartParams,
  CartService,
  ChangeItemQuantityParams,
  GetActiveCartForAssociateScopeServiceParams,
  RemoveItemFromCartParams,
  SaveCheckoutContactParams,
  SaveCheckoutDeliveryDetailsParams,
} from "./types";

async function getActiveCartForAssociateScope(
  params: GetActiveCartForAssociateScopeServiceParams
): Promise<ActionResult<Cart>> {
  const context = await storeService.getStoreContextByLocale(params.locale);

  return cartRepo.getActiveCartForAssociateScope({
    ...params,
    storeKey: StoreKey.make(context.storeKey),
  });
}

function getCartById(id: string, locale: Locale): Promise<ActionResult<Cart>> {
  return cartRepo.getCartById(id, locale);
}

async function createCart({
  locale,
}: {
  locale: Locale;
}): Promise<ActionResult<Cart>> {
  const ctx = await storeService.getStoreContextByLocale(locale);
  return cartRepo.createCart({
    locale,
    currency: ctx.currency,
    storeId: ctx.storeId,
  });
}

async function addItemToCart(
  params: AddToCartParams
): Promise<ActionResult<Cart>> {
  const ctx = await storeService.getStoreContextByLocale(params.locale);
  if (!ctx.distributionChannelKey) {
    throw new Error("Distribution channel key not found");
  }
  return cartRepo.addItemToCart({
    ...params,
    distributionChannelKey: ctx.distributionChannelKey,
  });
}

function changeItemQuantity(
  params: ChangeItemQuantityParams
): Promise<ActionResult<Cart>> {
  return cartRepo.changeItemQuantity(params);
}

function removeItemFromCart(
  params: RemoveItemFromCartParams
): Promise<ActionResult<Cart>> {
  return cartRepo.removeItemFromCart(params);
}

function saveCheckoutContact(
  params: SaveCheckoutContactParams
): Promise<ActionResult<void>> {
  return cartRepo.saveCheckoutContact(params);
}

function saveCheckoutDeliveryDetails(
  params: SaveCheckoutDeliveryDetailsParams
): Promise<ActionResult<void>> {
  return cartRepo.saveCheckoutDeliveryDetails(params);
}

export const cartService: CartService = {
  getActiveCartForAssociateScope,
  getCartById,
  createCart,
  addItemToCart,
  changeItemQuantity,
  removeItemFromCart,
  saveCheckoutContact,
  saveCheckoutDeliveryDetails,
};
