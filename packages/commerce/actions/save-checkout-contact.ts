"use server";

import { getLocale } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";
import { Effect, Result, Schema } from "effect";
import { revalidatePath } from "next/cache";
import { CartId, type CartId as CartIdType } from "../domain/cart";
import { CheckoutLocale, type CheckoutScope } from "../domain/checkout";
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
  checkoutContactNotFoundState,
  checkoutMutationFailureToActionState,
  invalidCheckoutContactFormState,
  type SaveCheckoutContactActionState,
  saveCheckoutContactActionSuccess,
} from "./save-checkout-contact-state";

const SaveCheckoutContactForm = Schema.Struct({
  cartId: CartId,
  cartVersion: Schema.NumberFromString,
  email: Schema.String,
  firstName: Schema.String,
  lastName: Schema.String,
  phoneNumber: Schema.optional(Schema.String),
});

type SaveCheckoutContactForm = typeof SaveCheckoutContactForm.Type;

const formString = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
};

const getFormInput = (formData: FormData) =>
  Schema.decodeUnknownEffect(SaveCheckoutContactForm)({
    cartId: formString(formData, "cartId"),
    cartVersion: formString(formData, "cartVersion"),
    email: formString(formData, "email"),
    firstName: formString(formData, "firstName"),
    lastName: formString(formData, "lastName"),
    phoneNumber: formString(formData, "phoneNumber") || undefined,
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

const saveContact = (scope: CheckoutScope, input: SaveCheckoutContactForm) =>
  CheckoutSession.saveContact({
    scope,
    cart: {
      id: input.cartId as CartIdType,
      version: input.cartVersion,
    },
    contact: {
      source: "manual",
      buyerContact: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        ...(input.phoneNumber === undefined
          ? {}
          : { phoneNumber: input.phoneNumber }),
      },
    },
  }).pipe(Effect.provide(checkoutRuntimeLayerCommercetools));

export async function saveCheckoutContact(
  _previousState: SaveCheckoutContactActionState,
  formData: FormData
): Promise<SaveCheckoutContactActionState> {
  const locale = await getLocale();
  const inputResult = await Effect.runPromise(
    Effect.result(getFormInput(formData))
  );

  if (Result.isFailure(inputResult)) {
    return invalidCheckoutContactFormState;
  }

  const scope = await getAnonymousCheckoutScope(locale);

  if (scope === null) {
    return checkoutContactNotFoundState;
  }

  const saveResult = await Effect.runPromise(
    Effect.result(saveContact(scope, inputResult.success))
  );

  if (Result.isFailure(saveResult)) {
    if (saveResult.failure._tag === "CheckoutUnavailable") {
      return checkoutContactNotFoundState;
    }

    if (saveResult.failure._tag === "CheckoutVersionConflict") {
      revalidatePath(`/${locale}/checkout`);
    }

    return checkoutMutationFailureToActionState(saveResult.failure);
  }

  revalidatePath(`/${locale}/checkout`);
  return saveCheckoutContactActionSuccess;
}
