"use server";

import { saveCheckoutContactForScope } from "@repo/commerce/actions/save-checkout-contact";
import type { SaveCheckoutContactActionState } from "@repo/commerce/actions/save-checkout-contact-state";
import { saveCheckoutDeliveryDetailsForScope } from "@repo/commerce/actions/save-checkout-delivery-details";
import type { SaveCheckoutDeliveryDetailsActionState } from "@repo/commerce/actions/save-checkout-delivery-details-state";
import { layerCommercetoolsCommerceAccounts } from "@repo/commerce/lib/infra/commercetools/commerce-accounts";
import { getLocale } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";
import { Effect, Result } from "effect";
import { revalidatePath } from "next/cache";
import { resolveCheckoutScope } from "../../../lib/checkout-scope";

const shouldRevalidate = (
  state: SaveCheckoutContactActionState | SaveCheckoutDeliveryDetailsActionState
) =>
  state.status === "success" ||
  (state.status === "error" && state.code === "checkout.versionConflict");

const resolveScope = (locale: Locale) =>
  resolveCheckoutScope(locale).pipe(
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

  if (shouldRevalidate(state)) {
    revalidatePath(`/${locale}/checkout`);
  }

  return state;
}

export async function saveCheckoutDeliveryDetails(
  _previousState: SaveCheckoutDeliveryDetailsActionState,
  formData: FormData
): Promise<SaveCheckoutDeliveryDetailsActionState> {
  const locale = await getLocale();
  const scopeResult = await Effect.runPromise(resolveScope(locale));

  if (Result.isFailure(scopeResult)) {
    return {
      status: "error",
      code:
        scopeResult.failure._tag === "CommerceRequestContextNotFound"
          ? "checkout.notFound"
          : "checkout.deliveryDetails.providerFailure",
    };
  }

  const state = await saveCheckoutDeliveryDetailsForScope(
    scopeResult.success,
    formData
  );

  if (shouldRevalidate(state)) {
    revalidatePath(`/${locale}/checkout`);
  }

  return state;
}
