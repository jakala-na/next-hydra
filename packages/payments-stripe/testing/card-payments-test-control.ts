import { Schema } from "effect";

const StripeAuthorizationSnapshot = Schema.Struct({
  amount_capturable: Schema.Int,
  amount_received: Schema.Int,
  latest_charge: Schema.optionalKey(Schema.NullOr(Schema.String)),
  status: Schema.String,
});

const StripeAuthorizedCardSnapshot = Schema.Struct({
  payment_method_details: Schema.Struct({
    card: Schema.Struct({
      brand: Schema.NonEmptyString,
      last4: Schema.NonEmptyString,
    }),
    type: Schema.Literal("card"),
  }),
});

const PRE_AUTHORIZATION_STATUSES = new Set([
  "requires_confirmation",
  "requires_payment_method",
]);
export const makeStripeCardPaymentsTestControl = (
  secretKey: string,
  request: typeof fetch = fetch
) => ({
  authorizeThenCancel: async (
    providerReference: string,
    confirmationReference: string,
    operationReference: string
  ): Promise<{
    readonly cardBrand: string;
    readonly lastFour: string;
    readonly providerTransactionReference: string;
  }> => {
    const response = await request(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(providerReference)}/confirm`,
      {
        body: new URLSearchParams({
          confirmation_token: confirmationReference,
        }),
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Idempotency-Key": operationReference,
        },
        method: "POST",
      }
    );
    if (!response.ok) {
      throw new Error(
        `Stripe PaymentIntent ${providerReference} could not be authorized (${response.status})`
      );
    }
    const authorized = Schema.decodeUnknownSync(StripeAuthorizationSnapshot)(
      await response.json()
    );
    if (authorized.status !== "requires_capture") {
      throw new Error(
        `Stripe PaymentIntent ${providerReference} was not authorized for manual capture (${authorized.status})`
      );
    }
    if (
      authorized.latest_charge === null ||
      authorized.latest_charge === undefined
    ) {
      throw new Error(
        `Stripe PaymentIntent ${providerReference} has no authorized Charge`
      );
    }

    const chargeResponse = await request(
      `https://api.stripe.com/v1/charges/${encodeURIComponent(authorized.latest_charge)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    if (!chargeResponse.ok) {
      throw new Error(
        `Stripe Charge ${authorized.latest_charge} could not be inspected (${chargeResponse.status})`
      );
    }
    const charge = Schema.decodeUnknownSync(StripeAuthorizedCardSnapshot)(
      await chargeResponse.json()
    );

    const cancelResponse = await request(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(providerReference)}/cancel`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
        method: "POST",
      }
    );
    if (!cancelResponse.ok) {
      throw new Error(
        `Stripe PaymentIntent ${providerReference} could not be canceled (${cancelResponse.status})`
      );
    }
    return {
      cardBrand: charge.payment_method_details.card.brand,
      lastFour: charge.payment_method_details.card.last4,
      providerTransactionReference: authorized.latest_charge,
    };
  },
  cancel: async (providerReference: string): Promise<void> => {
    const currentResponse = await request(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(providerReference)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    if (!currentResponse.ok) {
      throw new Error(
        `Stripe PaymentIntent ${providerReference} could not be inspected (${currentResponse.status})`
      );
    }
    const current = Schema.decodeUnknownSync(StripeAuthorizationSnapshot)(
      await currentResponse.json()
    );
    if (current.status === "canceled" || current.status === "succeeded") {
      return;
    }
    const response = await request(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(providerReference)}/cancel`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
        method: "POST",
      }
    );
    if (!response.ok) {
      throw new Error(
        `Stripe PaymentIntent ${providerReference} could not be canceled (${response.status})`
      );
    }
  },
  expectCaptured: async (
    providerReference: string,
    expectedMinorAmount: number
  ): Promise<void> => {
    const response = await request(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(providerReference)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    if (!response.ok) {
      throw new Error(
        `Stripe PaymentIntent ${providerReference} could not be inspected (${response.status})`
      );
    }
    const snapshot = Schema.decodeUnknownSync(StripeAuthorizationSnapshot)(
      await response.json()
    );
    if (
      snapshot.status !== "succeeded" ||
      snapshot.amount_capturable !== 0 ||
      snapshot.amount_received !== expectedMinorAmount
    ) {
      throw new Error(
        `Stripe PaymentIntent ${providerReference} was not captured once for ${expectedMinorAmount}: ${JSON.stringify(snapshot)}`
      );
    }
  },
  expectNotAuthorized: async (providerReference: string): Promise<void> => {
    const response = await request(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(providerReference)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    if (!response.ok) {
      throw new Error(
        `Stripe PaymentIntent ${providerReference} could not be inspected (${response.status})`
      );
    }
    const snapshot = Schema.decodeUnknownSync(StripeAuthorizationSnapshot)(
      await response.json()
    );
    if (
      snapshot.amount_capturable !== 0 ||
      !PRE_AUTHORIZATION_STATUSES.has(snapshot.status)
    ) {
      throw new Error(
        `Stripe PaymentIntent ${providerReference} was already authorized: ${snapshot.status}`
      );
    }
  },
});
