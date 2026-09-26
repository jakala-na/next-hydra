"use client";

import { useTranslations } from "@repo/i18n";
import { startTransition, useActionState } from "react";
import type { ComponentProps } from "react";

import type { BuyerContact, CheckoutContactSource } from "../domain/checkout";
import type {
  SaveCheckoutContactAction,
  SaveCheckoutContactActionFailure,
  SaveCheckoutContactActionInput,
} from "./action-contract";

type FormSubmitHandler = NonNullable<ComponentProps<"form">["onSubmit"]>;

interface SubmittedBuyerContact {
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
}

const formInputValue = (form: HTMLFormElement, name: string) => {
  const input = form.elements.namedItem(name);
  return input instanceof HTMLInputElement ? input.value : "";
};

const optionalFormInputValue = (form: HTMLFormElement, name: string) => {
  const value = formInputValue(form, name);
  return value === "" ? undefined : value;
};

export const contactSourceAfterAction = (
  actionFailure: SaveCheckoutContactActionFailure | undefined,
  source: CheckoutContactSource
): CheckoutContactSource =>
  actionFailure?.error._tag === "CheckoutCustomerProfileIncomplete"
    ? "manual"
    : source;

export const CheckoutContactForm = ({
  buyerContact,
  cartId,
  saveAction,
  source,
}: {
  readonly buyerContact?: BuyerContact;
  readonly cartId: string;
  readonly saveAction: SaveCheckoutContactAction;
  readonly source: CheckoutContactSource;
}) => {
  const t = useTranslations("web.checkout");
  const [actionResult, formAction, isPending] = useActionState(
    saveAction,
    null
  );
  const actionFailure =
    actionResult?._tag === "Failure" ? actionResult.failure : undefined;
  const activeSource = contactSourceAfterAction(actionFailure, source);
  let submitLabel = t("contact.actions.save");

  if (activeSource === "customerProfile") {
    submitLabel = t("contact.actions.useCustomerProfile");
  }
  if (isPending) {
    submitLabel = t("contact.actions.saving");
  }

  const submit: FormSubmitHandler = (event) => {
    event.preventDefault();
    const input: SaveCheckoutContactActionInput =
      activeSource === "customerProfile"
        ? {
            cart: { id: cartId },
            contact: { source: "customerProfile" },
          }
        : (() => {
            const form = event.currentTarget;
            const phoneNumber = optionalFormInputValue(form, "phoneNumber");
            const submittedBuyerContact: SubmittedBuyerContact = {
              email: formInputValue(form, "email"),
              firstName: formInputValue(form, "firstName"),
              lastName: formInputValue(form, "lastName"),
            };
            if (phoneNumber !== undefined) {
              submittedBuyerContact.phoneNumber = phoneNumber;
            }
            return {
              cart: { id: cartId },
              contact: {
                buyerContact: submittedBuyerContact,
                source: "manual",
              },
            };
          })();

    startTransition(() => {
      formAction(input);
    });
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {actionFailure === undefined ? null : (
        <p
          aria-live="polite"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
          role="alert"
        >
          {actionFailure.displayMessage}
        </p>
      )}
      {activeSource === "manual" ? (
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
};
