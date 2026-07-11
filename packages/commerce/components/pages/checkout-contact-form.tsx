"use client";

import { useActionState } from "react";
import { saveCheckoutContact } from "../../actions/save-checkout-contact";
import { initialSaveCheckoutContactActionState } from "../../actions/save-checkout-contact-state";
import type { BuyerContact } from "../../domain/checkout";

export function CheckoutContactForm({
  buyerContact,
  cartId,
  cartVersion,
}: {
  readonly buyerContact?: BuyerContact;
  readonly cartId: string;
  readonly cartVersion: number;
}) {
  const [actionState, formAction, isPending] = useActionState(
    saveCheckoutContact,
    initialSaveCheckoutContactActionState
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
          {actionState.message}
        </p>
      ) : null}
      <div className="grid gap-2">
        <label className="font-medium text-sm" htmlFor="checkout-email">
          Email
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
          <label className="font-medium text-sm" htmlFor="checkout-first-name">
            First name
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
          <label className="font-medium text-sm" htmlFor="checkout-last-name">
            Last name
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
          Phone
        </label>
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={buyerContact?.phoneNumber ?? ""}
          id="checkout-phone"
          name="phoneNumber"
          type="tel"
        />
      </div>
      <div>
        <button
          className="h-10 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Saving..." : "Save contact"}
        </button>
      </div>
    </form>
  );
}
