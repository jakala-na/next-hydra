"use client";

import type { CheckoutPaymentOptionsRendererProps } from "@repo/commerce/checkout";
import { CheckoutPaymentOptionsForm } from "@repo/commerce/checkout/payment-options-form";
import type { CardPaymentPreparationResult } from "@repo/commerce/checkout/payment-options-form";
import { PaymentConfirmationReference } from "@repo/payments";
import {
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useState } from "react";

import { PaymentElementsBoundary } from "./payment-elements-boundary";

const stripeByPublicConfiguration = new Map<
  string,
  ReturnType<typeof loadStripe>
>();

// oxlint-disable-next-line typescript/promise-function-async -- Async wrapping would replace Stripe's cached Promise identity on every render.
const stripeFor = (publicConfiguration: string) => {
  const current = stripeByPublicConfiguration.get(publicConfiguration);
  if (current !== undefined) {
    return current;
  }
  const loaded = loadStripe(publicConfiguration);
  stripeByPublicConfiguration.set(publicConfiguration, loaded);
  return loaded;
};

function StripeCardPaymentOptionsForm(
  props: CheckoutPaymentOptionsRendererProps
) {
  const stripe = useStripe();
  const elements = useElements();
  const [paymentElementState, setPaymentElementState] = useState<
    | { readonly _tag: "Loading" }
    | { readonly _tag: "Ready" }
    | { readonly _tag: "Failed"; readonly message?: string }
  >({ _tag: "Loading" });
  const [paymentElementComplete, setPaymentElementComplete] = useState(false);

  const prepareCard = async (): Promise<CardPaymentPreparationResult> => {
    if (stripe === null || elements === null) {
      return { _tag: "Unavailable", reason: "notReady" };
    }

    const submitted = await elements.submit();
    if (submitted.error !== undefined) {
      return {
        _tag: "Unavailable",
        message: submitted.error.message,
        reason: "invalid",
      };
    }

    const confirmation = await stripe.createConfirmationToken({
      elements,
      params: {
        payment_method_data: {
          billing_details: {
            address: {
              city: props.billingAddress.city,
              country: props.billingAddress.country,
              line1: props.billingAddress.addressLine1,
              line2: props.billingAddress.addressLine2,
              postal_code: props.billingAddress.postalCode,
              state: props.billingAddress.region,
            },
          },
        },
      },
    });
    if (confirmation.error !== undefined) {
      return {
        _tag: "Unavailable",
        message: confirmation.error.message,
        reason: "invalid",
      };
    }

    return {
      _tag: "Prepared",
      confirmationReference: PaymentConfirmationReference.make(
        confirmation.confirmationToken.id
      ),
    };
  };

  return (
    <CheckoutPaymentOptionsForm
      {...props}
      card={{
        fields: (
          <>
            <PaymentElement
              options={{
                fields: { billingDetails: { address: "never" } },
                wallets: { link: "never" },
              }}
              onChange={({ complete }) => {
                setPaymentElementComplete(complete);
              }}
              onLoadError={({ error }) => {
                if (error.message === undefined) {
                  setPaymentElementState({ _tag: "Failed" });
                  return;
                }
                setPaymentElementState({
                  _tag: "Failed",
                  message: error.message,
                });
              }}
              onReady={() => {
                setPaymentElementState({ _tag: "Ready" });
              }}
            />
            {paymentElementState._tag === "Failed" &&
            paymentElementState.message !== undefined ? (
              <p className="mt-3 text-destructive text-sm" role="alert">
                {paymentElementState.message}
              </p>
            ) : null}
          </>
        ),
        prepare: prepareCard,
        ready:
          stripe !== null &&
          elements !== null &&
          paymentElementState._tag === "Ready" &&
          paymentElementComplete,
      }}
    />
  );
}

export function CheckoutStripePaymentOptionsForm(
  props: CheckoutPaymentOptionsRendererProps
) {
  const cardOption = props.options.methods.find(
    (option) => option.method === "card"
  );
  if (cardOption === undefined) {
    return <CheckoutPaymentOptionsForm {...props} />;
  }

  const { clientIntegration } = cardOption.input;
  if (clientIntegration.provider !== "Stripe") {
    return <CheckoutPaymentOptionsForm {...props} />;
  }
  const stripe = stripeFor(clientIntegration.publicConfiguration);

  return (
    <PaymentElementsBoundary
      clientToken={clientIntegration.clientToken}
      stripe={stripe}
    >
      <StripeCardPaymentOptionsForm {...props} />
    </PaymentElementsBoundary>
  );
}
