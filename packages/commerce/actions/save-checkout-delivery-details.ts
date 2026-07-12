"use server";

import { getLocale } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";
import { Effect, Result, Schema } from "effect";
import { revalidatePath } from "next/cache";
import { CartId, type CartId as CartIdType } from "../domain/cart";
import {
  CheckoutLocale,
  type CheckoutScope,
  CountryCodeFromString,
} from "../domain/checkout";
import {
  AnonymousCommercePrincipal,
  CommerceRequestContext,
} from "../domain/commerce-request-context";
import { getAnonymousCartId } from "../lib/cart/utils/anonymous-cart-cookies";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import { checkoutRuntimeLayerCommercetools } from "../lib/checkout/commercetools";
import { toCheckoutScope } from "../lib/checkout/request-context";
import { storeService } from "../lib/store/store.service";
import {
  checkoutDeliveryDetailsMutationFailureToActionState,
  checkoutDeliveryDetailsNotFoundState,
  invalidCheckoutDeliveryDetailsFormState,
  type SaveCheckoutDeliveryDetailsActionState,
  saveCheckoutDeliveryDetailsActionSuccess,
} from "./save-checkout-delivery-details-state";

const SaveCheckoutDeliveryDetailsForm = Schema.Struct({
  cartId: CartId,
  cartVersion: Schema.NumberFromString,
  addressLine1: Schema.String,
  postalCode: Schema.String,
  city: Schema.String,
  country: CountryCodeFromString,
  addressLine2: Schema.optional(Schema.String),
  region: Schema.optional(Schema.String),
});

type SaveCheckoutDeliveryDetailsForm =
  typeof SaveCheckoutDeliveryDetailsForm.Type;

const formString = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
};

const getFormInput = (formData: FormData) =>
  Schema.decodeUnknownEffect(SaveCheckoutDeliveryDetailsForm)({
    cartId: formString(formData, "cartId"),
    cartVersion: formString(formData, "cartVersion"),
    addressLine1: formString(formData, "addressLine1"),
    postalCode: formString(formData, "postalCode"),
    city: formString(formData, "city"),
    country: formString(formData, "country"),
    addressLine2: formString(formData, "addressLine2") || undefined,
    region: formString(formData, "region") || undefined,
  });

const getAnonymousCheckoutScope = async (
  locale: Locale
): Promise<CheckoutScope | null> => {
  const storeContext = await storeService.getStoreContextByLocale(locale);
  const anonymousCartId = await getAnonymousCartId(storeContext);

  if (anonymousCartId === null || anonymousCartId.length === 0) {
    return null;
  }

  return toCheckoutScope(
    new CommerceRequestContext({
      locale: CheckoutLocale.make(locale),
      principal: new AnonymousCommercePrincipal({
        anonymousCartId: CartId.make(anonymousCartId),
      }),
    })
  );
};

const saveDeliveryDetails = (
  scope: CheckoutScope,
  input: SaveCheckoutDeliveryDetailsForm
) =>
  CheckoutSession.saveDeliveryDetails({
    scope,
    cart: {
      id: input.cartId as CartIdType,
      version: input.cartVersion,
    },
    deliveryDetails: {
      source: "manual",
      shippingAddress: {
        addressLine1: input.addressLine1,
        postalCode: input.postalCode,
        city: input.city,
        country: input.country,
        ...(input.addressLine2 === undefined
          ? {}
          : { addressLine2: input.addressLine2 }),
        ...(input.region === undefined ? {} : { region: input.region }),
      },
    },
  }).pipe(Effect.provide(checkoutRuntimeLayerCommercetools));

export async function saveCheckoutDeliveryDetails(
  _previousState: SaveCheckoutDeliveryDetailsActionState,
  formData: FormData
): Promise<SaveCheckoutDeliveryDetailsActionState> {
  const locale = await getLocale();
  const inputResult = await Effect.runPromise(
    Effect.result(getFormInput(formData))
  );

  if (Result.isFailure(inputResult)) {
    return invalidCheckoutDeliveryDetailsFormState;
  }

  const scope = await getAnonymousCheckoutScope(locale);

  if (scope === null) {
    return checkoutDeliveryDetailsNotFoundState;
  }

  const saveResult = await Effect.runPromise(
    Effect.result(saveDeliveryDetails(scope, inputResult.success))
  );

  if (Result.isFailure(saveResult)) {
    if (saveResult.failure._tag === "CheckoutUnavailable") {
      return checkoutDeliveryDetailsNotFoundState;
    }

    if (saveResult.failure._tag === "CheckoutVersionConflict") {
      revalidatePath(`/${locale}/checkout`);
    }

    return checkoutDeliveryDetailsMutationFailureToActionState(
      saveResult.failure
    );
  }

  revalidatePath(`/${locale}/checkout`);
  return saveCheckoutDeliveryDetailsActionSuccess;
}
