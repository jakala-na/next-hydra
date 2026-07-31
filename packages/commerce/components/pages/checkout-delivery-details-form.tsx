"use client";

import { useTranslations } from "@repo/i18n";
import { useActionState } from "react";
import {
  initialSaveCheckoutDeliveryDetailsActionState,
  type SaveCheckoutDeliveryDetailsAction,
} from "../../actions/save-checkout-delivery-details-state";
import type { ShippingAddress } from "../../domain/checkout";
import { checkoutActionErrorMessageKey } from "./checkout-action-error";

export function CheckoutDeliveryDetailsForm({
  cartId,
  cartVersion,
  saveAction,
  shippingAddress,
}: {
  readonly cartId: string;
  readonly cartVersion: number;
  readonly saveAction: SaveCheckoutDeliveryDetailsAction;
  readonly shippingAddress?: ShippingAddress;
}) {
  const t = useTranslations("web.checkout");
  const [actionState, formAction, isPending] = useActionState(
    saveAction,
    initialSaveCheckoutDeliveryDetailsActionState
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input name="cartId" type="hidden" value={cartId} />
      <input name="cartVersion" type="hidden" value={cartVersion} />
      {actionState.status === "error" ? (
        <p
          aria-live="polite"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
          role="alert"
        >
          {t(checkoutActionErrorMessageKey[actionState.code])}
        </p>
      ) : null}
      <div className="grid gap-2">
        <label
          className="font-medium text-sm"
          htmlFor="checkout-address-line-1"
        >
          {t("deliveryDetails.fields.addressLine1")}
        </label>
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={shippingAddress?.addressLine1 ?? ""}
          id="checkout-address-line-1"
          name="addressLine1"
          required
          type="text"
        />
      </div>
      <div className="grid gap-2">
        <label
          className="font-medium text-sm"
          htmlFor="checkout-address-line-2"
        >
          {t("deliveryDetails.fields.addressLine2")}
        </label>
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={shippingAddress?.addressLine2 ?? ""}
          id="checkout-address-line-2"
          name="addressLine2"
          type="text"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor="checkout-city">
            {t("deliveryDetails.fields.city")}
          </label>
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={shippingAddress?.city ?? ""}
            id="checkout-city"
            name="city"
            required
            type="text"
          />
        </div>
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor="checkout-postal-code">
            {t("deliveryDetails.fields.postalCode")}
          </label>
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={shippingAddress?.postalCode ?? ""}
            id="checkout-postal-code"
            name="postalCode"
            required
            type="text"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor="checkout-region">
            {t("deliveryDetails.fields.region")}
          </label>
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={shippingAddress?.region ?? ""}
            id="checkout-region"
            name="region"
            type="text"
          />
        </div>
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor="checkout-country">
            {t("deliveryDetails.fields.country")}
          </label>
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm uppercase"
            defaultValue={shippingAddress?.country ?? ""}
            id="checkout-country"
            maxLength={2}
            name="country"
            required
            type="text"
          />
        </div>
      </div>
      <div>
        <button
          className="h-10 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? t("deliveryDetails.actions.saving")
            : t("deliveryDetails.actions.save")}
        </button>
      </div>
    </form>
  );
}
