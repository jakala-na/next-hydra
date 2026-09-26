"use client";

import { useTranslations } from "@repo/i18n";
import type {
  PaymentConfirmationReference,
  PaymentMethod,
  PaymentOptions,
} from "@repo/payments";
import { startTransition, useActionState, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";

import type { CartId } from "../domain/cart";
import type { SaveCheckoutPaymentOptionsAction } from "./action-contract";
import { availablePaymentMethod } from "./payment-method-selection";

const CENTS_PER_MAJOR_CURRENCY_UNIT = 100;
type FormSubmitHandler = NonNullable<ComponentProps<"form">["onSubmit"]>;

const formatMoney = (money: PaymentOptions["amount"], locale: string) =>
  new Intl.NumberFormat(locale, {
    currency: money.currencyCode,
    style: "currency",
  }).format(money.centAmount / CENTS_PER_MAJOR_CURRENCY_UNIT);

export type CardPaymentPreparationResult =
  | {
      readonly _tag: "Prepared";
      readonly confirmationReference: PaymentConfirmationReference;
    }
  | {
      readonly _tag: "Unavailable";
      readonly message?: string;
      readonly reason: "invalid" | "notReady";
    };

export interface CheckoutCardPaymentEntry {
  readonly fields: ReactNode;
  readonly prepare: () => Promise<CardPaymentPreparationResult>;
  readonly ready: boolean;
}

export interface CheckoutPaymentOptionsFormProps {
  readonly card?: CheckoutCardPaymentEntry;
  readonly cartId: CartId;
  readonly locale: string;
  readonly options: PaymentOptions;
  readonly saveAction: SaveCheckoutPaymentOptionsAction;
  readonly selectedMethod?: PaymentMethod;
}

export function CheckoutPaymentOptionsForm({
  card,
  cartId,
  locale,
  options,
  saveAction,
  selectedMethod,
}: CheckoutPaymentOptionsFormProps) {
  const t = useTranslations("web.checkout.paymentOptions");
  const cardOption = options.methods.find((option) => option.method === "card");
  const [preferredMethod, setPreferredMethod] = useState<PaymentMethod>(
    selectedMethod ?? "card"
  );
  const method = availablePaymentMethod(options.methods, preferredMethod);
  const [clientFailure, setClientFailure] = useState<string>();
  const preparingCard = useRef(false);
  const [isPreparingCard, setIsPreparingCard] = useState(false);
  const [actionResult, formAction, isPending] = useActionState(
    saveAction,
    null
  );
  const actionFailure =
    actionResult?._tag === "Failure" ? actionResult.failure : undefined;

  const submitCard = async () => {
    if (preparingCard.current || isPending) {
      return;
    }

    preparingCard.current = true;
    setIsPreparingCard(true);
    setClientFailure(undefined);
    try {
      if (card === undefined || cardOption === undefined) {
        setClientFailure(t("cardNotReady"));
        return;
      }
      const preparation = await card.prepare();
      if (preparation._tag === "Unavailable") {
        setClientFailure(
          preparation.message ??
            t(
              preparation.reason === "notReady" ? "cardNotReady" : "cardInvalid"
            )
        );
        return;
      }

      startTransition(() => {
        formAction({
          cart: { id: cartId },
          selection: {
            billingAddress: { source: "shippingAddress" },
            payment: {
              confirmationReference: preparation.confirmationReference,
              method: "card",
              preparationReference: cardOption.input.preparationReference,
            },
          },
        });
      });
    } finally {
      preparingCard.current = false;
      setIsPreparingCard(false);
    }
  };

  const submit: FormSubmitHandler = (event) => {
    event.preventDefault();
    if (method === "netTerms") {
      startTransition(() => {
        formAction({
          cart: { id: cartId },
          selection: {
            billingAddress: { source: "shippingAddress" },
            payment: { method: "netTerms" },
          },
        });
      });
      return;
    }

    void submitCard();
  };

  return (
    <form className="grid gap-6" onSubmit={submit}>
      {clientFailure === undefined && actionFailure === undefined ? null : (
        <p
          aria-live="polite"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
          role="alert"
        >
          {clientFailure ?? actionFailure?.displayMessage}
        </p>
      )}
      <fieldset className="grid gap-3">
        <legend className="font-medium text-sm">{t("chooseMethod")}</legend>
        {options.methods.map((option) => (
          <label
            className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-3 rounded-md border border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
            data-payment-method={option.method}
            data-payment-method-availability={option.availability}
            key={option.method}
          >
            <input
              checked={method === option.method}
              disabled={option.availability === "unavailable"}
              name="payment-method-choice"
              onChange={() => {
                setPreferredMethod(option.method);
              }}
              type="radio"
            />
            <span>
              <span className="block font-medium text-sm">
                {option.method === "card"
                  ? t("card")
                  : t("netTerms", { days: option.termsInDays })}
              </span>
              {option.method === "netTerms" ? (
                <span
                  className="block text-muted-foreground text-sm"
                  data-commerce-money="net-terms-available-balance"
                  data-currency={option.availableCredit.currencyCode}
                  data-minor-amount={option.availableCredit.centAmount}
                >
                  {t("availableToSpend", {
                    amount: formatMoney(option.availableCredit, locale),
                  })}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>
      {method === "card" ? (
        <div className="rounded-md border border-border p-4">
          {card?.fields}
        </div>
      ) : null}
      <label className="flex items-center gap-3 text-sm">
        <input checked disabled readOnly type="checkbox" />
        <span>{t("useShippingAddress")}</span>
      </label>
      <button
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm disabled:opacity-50"
        disabled={
          isPending ||
          isPreparingCard ||
          (method === "card" && card?.ready !== true)
        }
        type="submit"
      >
        {isPending || isPreparingCard ? t("saving") : t("save")}
      </button>
    </form>
  );
}
