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
  SaveCheckoutContactActionResult,
  SaveCheckoutDeliveryDetailsActionResult,
} from "@repo/commerce/checkout";
import { makeCheckoutProcedures } from "@repo/commerce/checkout/procedures";
import { getTranslations } from "@repo/i18n";
import { Effect } from "effect";

import { AppRuntime } from "./app-runtime";
import { CommerceActions } from "./commerce-runtime";
import { NextRequestApi } from "./next-request";

const {
  addToCartProcedure,
  changeCartItemsQuantityProcedure,
  removeCartItemProcedure,
} = makeCartProcedures(CommerceActions);
const { saveCheckoutContactProcedure, saveCheckoutDeliveryDetailsProcedure } =
  makeCheckoutProcedures(CommerceActions);

const addToCartAction = addToCartProcedure.toAction();
const changeCartItemsQuantityAction =
  changeCartItemsQuantityProcedure.toAction();
const removeCartItemAction = removeCartItemProcedure.toAction();
const saveCheckoutContactAction = saveCheckoutContactProcedure.toFormAction({
  getFailureMessage: async (error, { locale }) => {
    const t = await getTranslations({
      locale,
      namespace: "web.checkout.errors.saveContact",
    });

    return t(
      error._tag === "InputInvalid"
        ? "CheckoutMutationSchemaFailure"
        : error._tag
    );
  },
});
const saveCheckoutDeliveryDetailsAction =
  saveCheckoutDeliveryDetailsProcedure.toFormAction({
    getFailureMessage: async (error, { locale }) => {
      const t = await getTranslations({
        locale,
        namespace: "web.checkout.errors.saveDeliveryDetails",
      });

      return t(
        error._tag === "InputInvalid"
          ? "CheckoutMutationSchemaFailure"
          : error._tag
      );
    },
  });

const revalidateCheckout = Effect.fn("CheckoutAction.revalidate")(
  function* revalidateCheckoutEffect() {
    const request = yield* NextRequestApi;
    const next = yield* NextServer;
    const locale = yield* request.getLocale();
    yield* next.revalidatePath(`/${locale}/checkout`);
  }
);

const shouldRevalidateContact = (result: SaveCheckoutContactActionResult) =>
  result._tag === "Success" ||
  result.failure.error._tag === "CheckoutCartMismatch" ||
  result.failure.error._tag === "CheckoutMutationOutcomeUnknown" ||
  result.failure.error._tag === "CheckoutVersionConflict";

const shouldRevalidateDeliveryDetails = (
  result: SaveCheckoutDeliveryDetailsActionResult
) =>
  result._tag === "Success" ||
  result.failure.error._tag === "CheckoutCartMismatch" ||
  result.failure.error._tag === "CheckoutMutationOutcomeUnknown" ||
  result.failure.error._tag === "CheckoutVersionConflict" ||
  (result.failure.error._tag === "CheckoutMutationProviderFailure" &&
    result.failure.error.addressBookReference !== undefined);

const revalidateCheckoutWhen = async (condition: boolean) => {
  if (condition) {
    await AppRuntime.runPromise(revalidateCheckout());
  }
};

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

export const saveCheckoutContact = async (
  previousResult: SaveCheckoutContactActionResult | null,
  formData: FormData
): Promise<SaveCheckoutContactActionResult> => {
  const result = await saveCheckoutContactAction(previousResult, formData);
  await revalidateCheckoutWhen(shouldRevalidateContact(result));
  return result;
};

export const saveCheckoutDeliveryDetails = async (
  previousResult: SaveCheckoutDeliveryDetailsActionResult | null,
  formData: FormData
): Promise<SaveCheckoutDeliveryDetailsActionResult> => {
  const result = await saveCheckoutDeliveryDetailsAction(
    previousResult,
    formData
  );
  await revalidateCheckoutWhen(shouldRevalidateDeliveryDetails(result));
  return result;
};
