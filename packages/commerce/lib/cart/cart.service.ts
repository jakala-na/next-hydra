import type { Locale } from '@repo/i18n/types';
import type { Cart } from '../types';
import { storeService } from '../store/store.service';
import type { ActionResult } from '../utils/errors';
import { cartRepo } from './cart.repo';
import type {
  AddToCartParams,
  CartService,
  ChangeItemQuantityParams,
  RemoveItemFromCartParams,
} from './types';

function getCustomerActiveCart(
  customerId: string,
  locale: Locale
): Promise<ActionResult<Cart>> {
  return cartRepo.getCustomerActiveCart(customerId, locale);
}

function getCartById(
  id: string,
  locale: Locale
): Promise<ActionResult<Cart>> {
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
    throw new Error('Distribution channel key not found');
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

export const cartService: CartService = {
  getCustomerActiveCart,
  getCartById,
  createCart,
  addItemToCart,
  changeItemQuantity,
  removeItemFromCart,
};
