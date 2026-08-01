"use server";

import { saveCheckoutContactForScope } from "@repo/commerce/actions/save-checkout-contact";
import type { SaveCheckoutContactActionState } from "@repo/commerce/actions/save-checkout-contact-state";
import { saveCheckoutDeliveryDetailsForContext } from "@repo/commerce/actions/save-checkout-delivery-details";
import type { SaveCheckoutDeliveryDetailsActionState } from "@repo/commerce/actions/save-checkout-delivery-details-state";
import { layerCommercetoolsCommerceAccounts } from "@repo/commerce/lib/infra/commercetools/commerce-accounts";
import { getLocale } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";
import { Effect, Result } from "effect";
import { revalidatePath } from "next/cache";
import {
  resolveCheckoutContext,
  resolveCheckoutScope,
} from "../../../lib/checkout-scope";

const shouldRevalidateContact = (state: SaveCheckoutContactActionState) =>
  state.status === "success" ||
  (state.status === "error" &&
    (state.code === "checkout.cartMismatch" ||
      state.code === "checkout.versionConflict"));

const shouldRevalidateDeliveryDetails = (
  state: SaveCheckoutDeliveryDetailsActionState
) =>
  state.status === "success" ||
  (state.status === "error" &&
    (state.code === "checkout.cartMismatch" ||
      state.code === "checkout.versionConflict" ||
      (state.code === "checkout.deliveryDetails.providerFailure" &&
        state.parameters?.addressBookReference !== undefined)));

const logUnexpectedCheckoutContextFailure = (error: {
  readonly _tag: string;
  readonly message: string;
}) =>
  error._tag === "CommerceRequestContextNotFound"
    ? Effect.void
    : Effect.logError(error.message, error).pipe(
        Effect.annotateLogs({ "checkout.error.tag": error._tag })
      );

const resolveScope = (locale: Locale) =>
  resolveCheckoutScope(locale).pipe(
    Effect.tapError(logUnexpectedCheckoutContextFailure),
    Effect.result,
    Effect.provide(layerCommercetoolsCommerceAccounts)
  );

const resolveContext = (locale: Locale) =>
  resolveCheckoutContext(locale).pipe(
    Effect.tapError(logUnexpectedCheckoutContextFailure),
    Effect.result,
    Effect.provide(layerCommercetoolsCommerceAccounts)
  );

export async function saveCheckoutContact(
  _previousState: SaveCheckoutContactActionState,
  formData: FormData
): Promise<SaveCheckoutContactActionState> {
  const locale = await getLocale();
  const scopeResult = await Effect.runPromise(resolveScope(locale));

  if (Result.isFailure(scopeResult)) {
    return {
      status: "error",
      code:
        scopeResult.failure._tag === "CommerceRequestContextNotFound"
          ? "checkout.notFound"
          : "checkout.contact.providerFailure",
    };
  }

  const state = await saveCheckoutContactForScope(
    scopeResult.success,
    formData
  );

  if (shouldRevalidateContact(state)) {
    revalidatePath(`/${locale}/checkout`);
  }

  return state;
}

export async function saveCheckoutDeliveryDetails(
  _previousState: SaveCheckoutDeliveryDetailsActionState,
  formData: FormData
): Promise<SaveCheckoutDeliveryDetailsActionState> {
  const locale = await getLocale();
  const contextResult = await Effect.runPromise(resolveContext(locale));

  if (Result.isFailure(contextResult)) {
    return {
      status: "error",
      code:
        contextResult.failure._tag === "CommerceRequestContextNotFound"
          ? "checkout.notFound"
          : "checkout.deliveryDetails.providerFailure",
    };
  }

  const state = await saveCheckoutDeliveryDetailsForContext(
    contextResult.success,
    formData
  );

  if (shouldRevalidateDeliveryDetails(state)) {
    revalidatePath(`/${locale}/checkout`);
  }

  return state;
}
