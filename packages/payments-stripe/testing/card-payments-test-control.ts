import { Schema } from "effect";

const StripeAuthorizationSnapshot = Schema.Struct({
  amount_capturable: Schema.Int,
  status: Schema.String,
});

const PRE_AUTHORIZATION_STATUSES = new Set([
  "requires_confirmation",
  "requires_payment_method",
]);

export const makeStripeCardPaymentsTestControl = (
  secretKey: string,
  request: typeof fetch = fetch
) => ({
  cancel: async (providerReference: string): Promise<void> => {
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
