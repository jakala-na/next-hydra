"use server";

import { saveCheckoutContactForScope } from "@repo/commerce/actions/save-checkout-contact";
import type { SaveCheckoutContactActionState } from "@repo/commerce/actions/save-checkout-contact-state";
import { saveCheckoutDeliveryDetailsForContext } from "@repo/commerce/actions/save-checkout-delivery-details";
import type { SaveCheckoutDeliveryDetailsActionState } from "@repo/commerce/actions/save-checkout-delivery-details-state";
import { toCheckoutScope } from "@repo/commerce/lib/checkout/request-context";
import { getLocale } from "@repo/i18n";
import { revalidatePath } from "next/cache";
import { runCheckoutWriteWithContext } from "../../../lib/current-cart";

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

export async function saveCheckoutContact(
  _previousState: SaveCheckoutContactActionState,
  formData: FormData
): Promise<SaveCheckoutContactActionState> {
  const locale = await getLocale();
  const state =
    await runCheckoutWriteWithContext<SaveCheckoutContactActionState>(
      locale,
      async (context, run) =>
        context === null
          ? { status: "error" as const, code: "checkout.notFound" as const }
          : saveCheckoutContactForScope(
              toCheckoutScope(context),
              formData,
              run
            ),
      async () => ({
        status: "error" as const,
        code: "checkout.contact.providerFailure" as const,
      })
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
  const state =
    await runCheckoutWriteWithContext<SaveCheckoutDeliveryDetailsActionState>(
      locale,
      async (context, run) =>
        context === null
          ? { status: "error" as const, code: "checkout.notFound" as const }
          : saveCheckoutDeliveryDetailsForContext(context, formData, run),
      async () => ({
        status: "error" as const,
        code: "checkout.deliveryDetails.providerFailure" as const,
      })
    );

  if (shouldRevalidateDeliveryDetails(state)) {
    revalidatePath(`/${locale}/checkout`);
  }

  return state;
}
