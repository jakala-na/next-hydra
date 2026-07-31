"use client";

import { useTranslations } from "@repo/i18n";
import { useActionState } from "react";
import {
  initialSaveCheckoutContactActionState,
  type SaveCheckoutContactAction,
} from "../../actions/save-checkout-contact-state";
import type {
  BuyerContact,
  CheckoutContactSource,
} from "../../domain/checkout";
import { checkoutActionErrorMessageKey } from "./checkout-action-error";

export function CheckoutContactForm({
  buyerContact,
  cartId,
  cartVersion,
  saveAction,
  source,
}: {
  readonly buyerContact?: BuyerContact;
  readonly cartId: string;
  readonly cartVersion: number;
  readonly saveAction: SaveCheckoutContactAction;
  readonly source: CheckoutContactSource;
}) {
  const t = useTranslations("web.checkout");
  const [actionState, formAction, isPending] = useActionState(
    saveAction,
    initialSaveCheckoutContactActionState
  );
  let submitLabel = t("contact.actions.save");

  if (source === "customerProfile") {
    submitLabel = t("contact.actions.useCustomerProfile");
  }
  if (isPending) {
    submitLabel = t("contact.actions.saving");
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input name="cartId" type="hidden" value={cartId} />
      <input name="cartVersion" type="hidden" value={cartVersion} />
      <input name="source" type="hidden" value={source} />
      {actionState.status === "error" ? (
        <p
          aria-live="polite"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
          role="alert"
        >
          {t(checkoutActionErrorMessageKey[actionState.code])}
        </p>
      ) : null}
      {source === "manual" ? (
        <>
          <div className="grid gap-2">
            <label className="font-medium text-sm" htmlFor="checkout-email">
              {t("contact.fields.email")}
            </label>
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={buyerContact?.email ?? ""}
              id="checkout-email"
              name="email"
              required
              type="email"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <label
                className="font-medium text-sm"
                htmlFor="checkout-first-name"
              >
                {t("contact.fields.firstName")}
              </label>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={buyerContact?.firstName ?? ""}
                id="checkout-first-name"
                name="firstName"
                required
                type="text"
              />
            </div>
            <div className="grid gap-2">
              <label
                className="font-medium text-sm"
                htmlFor="checkout-last-name"
              >
                {t("contact.fields.lastName")}
              </label>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={buyerContact?.lastName ?? ""}
                id="checkout-last-name"
                name="lastName"
                required
                type="text"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <label className="font-medium text-sm" htmlFor="checkout-phone">
              {t("contact.fields.phone")}
            </label>
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={buyerContact?.phoneNumber ?? ""}
              id="checkout-phone"
              name="phoneNumber"
              type="tel"
            />
          </div>
        </>
      ) : null}
      <div>
        <button
          className="h-10 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
