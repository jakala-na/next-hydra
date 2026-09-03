"use server";

import { NextServer } from "@repo/actions/next-server";
import type {
  AddToCartActionResult,
  RemoveCartLineItemActionResult,
  SetCartLineItemQuantityActionResult,
} from "@repo/commerce/cart";
import type { AddToCartInput } from "@repo/commerce/cart/add-to-cart";
import type { ChangeCartItemsQuantityInput } from "@repo/commerce/cart/change-cart-items-quantity";
import { makeCartProcedures } from "@repo/commerce/cart/procedures";
import type { RemoveCartItemInput } from "@repo/commerce/cart/remove-cart-item";
import type {
  PlaceCheckoutOrderActionInput,
  PlaceCheckoutOrderActionResult,
  SaveCheckoutContactAction,
  SaveCheckoutDeliveryDetailsAction,
  SaveCheckoutPaymentOptionsAction,
  SaveCheckoutShippingOptionsAction,
} from "@repo/commerce/checkout";
import { makeCheckoutProcedures } from "@repo/commerce/checkout/procedures";
import { CartId } from "@repo/commerce/domain/cart";
import {
  AnonymousOrderAccessCookie,
  ANONYMOUS_ORDER_ACCESS_COOKIE_NAME,
  ANONYMOUS_ORDER_ACCESS_COOKIE_OPTIONS,
  encodeAnonymousOrderAccessCookie,
} from "@repo/commerce/lib/order/utils/anonymous-order-access-cookie";
import {
  OrderPlacementRecoveryCookie,
  ORDER_PLACEMENT_RECOVERY_COOKIE_NAME,
  ORDER_PLACEMENT_RECOVERY_COOKIE_OPTIONS,
  encodeOrderPlacementRecoveryCookie,
} from "@repo/commerce/lib/order/utils/order-placement-recovery-cookie";
import { getTranslations } from "@repo/i18n";
import { Effect, Option, Schema } from "effect";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppRuntime } from "./app-runtime";
import {
  shouldRevalidateContact,
  shouldRevalidateDeliveryDetails,
  shouldRevalidatePaymentOptions,
  shouldRevalidatePlaceOrderFailure,
  shouldRevalidateShippingOptions,
} from "./commerce-action-cache-policy";
import { CommerceActions } from "./commerce-runtime";
import { CurrentAuth } from "./current-auth-api";
import { NextRequestApi } from "./next-request";

const {
  addToCartProcedure,
  changeCartItemsQuantityProcedure,
  removeCartItemProcedure,
} = makeCartProcedures(CommerceActions);
const {
  placeCheckoutOrderProcedure,
  saveCheckoutContactProcedure,
  saveCheckoutDeliveryDetailsProcedure,
  saveCheckoutPaymentOptionsProcedure,
  saveCheckoutShippingOptionsProcedure,
} = makeCheckoutProcedures(CommerceActions);

const revalidateCheckout = Effect.fn("CheckoutAction.revalidate")(
  function* revalidateCheckoutEffect() {
    const request = yield* NextRequestApi;
    const next = yield* NextServer;
    const locale = yield* request.getLocale();
    yield* next.revalidatePath(`/${locale}/checkout`);
  }
);

const revalidateCheckoutWhen = async (condition: boolean) => {
  if (condition) {
    await AppRuntime.runPromise(revalidateCheckout());
  }
};

const rememberOrderPlacementCart = async (cartIdInput: string) => {
  const cartId = Schema.decodeOption(CartId)(cartIdInput);
  if (Option.isSome(cartId)) {
    const cookieStore = await cookies();
    cookieStore.set(
      ORDER_PLACEMENT_RECOVERY_COOKIE_NAME,
      encodeOrderPlacementRecoveryCookie(
        new OrderPlacementRecoveryCookie({ cartId: cartId.value })
      ),
      ORDER_PLACEMENT_RECOVERY_COOKIE_OPTIONS
    );
  }
};

const addToCartAction = addToCartProcedure.toAction();
const changeCartItemsQuantityAction =
  changeCartItemsQuantityProcedure.toAction();
const removeCartItemAction = removeCartItemProcedure.toAction();

export const saveCheckoutContact: SaveCheckoutContactAction =
  saveCheckoutContactProcedure.toActionState({
    getFailureMessage: async (error, { locale }) => {
      const t = await getTranslations({
        locale,
        namespace: "web.checkout.errors.saveContact",
      });

      return t(error._tag);
    },
    onResult: async (result) => {
      await revalidateCheckoutWhen(shouldRevalidateContact(result));
    },
  });

export const saveCheckoutDeliveryDetails: SaveCheckoutDeliveryDetailsAction =
  saveCheckoutDeliveryDetailsProcedure.toActionState({
    getFailureMessage: async (error, { locale }) => {
      const t = await getTranslations({
        locale,
        namespace: "web.checkout.errors.saveDeliveryDetails",
      });

      return t(error._tag);
    },
    onResult: async (result) => {
      await revalidateCheckoutWhen(shouldRevalidateDeliveryDetails(result));
    },
  });

export const saveCheckoutShippingOptions: SaveCheckoutShippingOptionsAction =
  saveCheckoutShippingOptionsProcedure.toActionState({
    getFailureMessage: async (error, { locale }) => {
      const t = await getTranslations({
        locale,
        namespace: "web.checkout.errors.saveShippingOptions",
      });

      return t(error._tag);
    },
    onResult: async (result) => {
      await revalidateCheckoutWhen(shouldRevalidateShippingOptions(result));
    },
  });

export const saveCheckoutPaymentOptions: SaveCheckoutPaymentOptionsAction =
  saveCheckoutPaymentOptionsProcedure.toActionState({
    getFailureMessage: async (error, { locale }) => {
      const t = await getTranslations({
        locale,
        namespace: "web.checkout.errors.savePaymentOptions",
      });

      return t(error._tag);
    },
    onResult: async (result) => {
      if (result._tag === "Success") {
        await rememberOrderPlacementCart(result.success.cart.id);
      }
      await revalidateCheckoutWhen(shouldRevalidatePaymentOptions(result));
    },
  });

const placeCheckoutOrderAction = placeCheckoutOrderProcedure.toActionState({
  // oxlint-disable-next-line eslint/require-await -- Public Checkout errors already carry safe localized messages.
  getFailureMessage: async (error) => error.message,
  onFailure: async (error) => {
    await revalidateCheckoutWhen(shouldRevalidatePlaceOrderFailure(error));
  },
  onSuccess: async (result, { locale }) => {
    if (result._tag === "Placed") {
      const currentAuth = await AppRuntime.runPromise(
        CurrentAuth.pipe(
          Effect.flatMap((auth) => auth.snapshot),
          Effect.orDie
        )
      );
      if (currentAuth.userId === undefined) {
        const cookieStore = await cookies();
        cookieStore.set(
          ANONYMOUS_ORDER_ACCESS_COOKIE_NAME,
          encodeAnonymousOrderAccessCookie(
            new AnonymousOrderAccessCookie({
              cartId: result.order.cartId,
              orderId: result.order.id,
            })
          ),
          ANONYMOUS_ORDER_ACCESS_COOKIE_OPTIONS
        );
      }
      const cookieStore = await cookies();
      cookieStore.delete(ORDER_PLACEMENT_RECOVERY_COOKIE_NAME);
      redirect(
        `/${locale}/checkout/orders/${encodeURIComponent(result.order.id)}`
      );
    }
  },
});

export const addToCart = async (
  input: AddToCartInput
): Promise<AddToCartActionResult> => await addToCartAction(input);

export const changeCartItemsQuantity = async (
  input: ChangeCartItemsQuantityInput
): Promise<SetCartLineItemQuantityActionResult> =>
  await changeCartItemsQuantityAction(input);

export const removeCartItem = async (
  input: RemoveCartItemInput
): Promise<RemoveCartLineItemActionResult> => await removeCartItemAction(input);

export const placeCheckoutOrder = async (
  previousResult: PlaceCheckoutOrderActionResult | null,
  input: PlaceCheckoutOrderActionInput
): Promise<PlaceCheckoutOrderActionResult> => {
  await rememberOrderPlacementCart(input.cart.id);
  return await placeCheckoutOrderAction(previousResult, input);
};
