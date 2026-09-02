/* oxlint-disable typescript/promise-function-async -- The fetch contract double returns an already-settled Promise. */
import { describe, expect, it } from "vitest";

import { makeStripeCardPaymentsTestControl } from "./card-payments-test-control";

describe("Stripe Card Payments test control", () => {
  it("primes a manual authorization that will fail during capture", async () => {
    const requests: {
      readonly init?: RequestInit;
      readonly input: RequestInfo | URL;
    }[] = [];
    const responses = [
      Response.json({
        amount_capturable: 2500,
        amount_received: 0,
        latest_charge: "ch-from-provider",
        status: "requires_capture",
      }),
      Response.json({
        payment_method_details: {
          card: { brand: "visa", last4: "4242" },
          type: "card",
        },
      }),
      new Response(null, { status: 200 }),
    ];
    const request: typeof fetch = (input, init) => {
      requests.push({ init, input });
      const response = responses[requests.length - 1];
      if (response === undefined) {
        throw new Error("Unexpected Stripe request");
      }
      return Promise.resolve(response);
    };

    const authorization = await makeStripeCardPaymentsTestControl(
      "sk_test_from_input",
      request
    ).authorizeThenCancel(
      "pi/from-input",
      "ctoken-from-input",
      "attempt-from-input:e2e-capture-failure"
    );

    expect(authorization).toStrictEqual({
      cardBrand: "visa",
      lastFour: "4242",
      providerTransactionReference: "ch-from-provider",
    });
    expect(requests[0]).toMatchObject({
      init: {
        headers: {
          Authorization: "Bearer sk_test_from_input",
          "Idempotency-Key": "attempt-from-input:e2e-capture-failure",
        },
        method: "POST",
      },
      input:
        "https://api.stripe.com/v1/payment_intents/pi%2Ffrom-input/confirm",
    });
    expect(requests[0]?.init?.body).toStrictEqual(
      new URLSearchParams({ confirmation_token: "ctoken-from-input" })
    );
    expect(requests[1]).toStrictEqual({
      init: {
        headers: { Authorization: "Bearer sk_test_from_input" },
      },
      input: "https://api.stripe.com/v1/charges/ch-from-provider",
    });
    expect(requests[2]).toStrictEqual({
      init: {
        headers: { Authorization: "Bearer sk_test_from_input" },
        method: "POST",
      },
      input: "https://api.stripe.com/v1/payment_intents/pi%2Ffrom-input/cancel",
    });
  });

  it("cancels the prepared PaymentIntent", async () => {
    const requests: {
      readonly init?: RequestInit;
      readonly input: RequestInfo | URL;
    }[] = [];
    const request: typeof fetch = (input, init) => {
      requests.push({ init, input });
      return Promise.resolve(
        requests.length === 1
          ? Response.json({
              amount_capturable: 0,
              amount_received: 0,
              status: "requires_payment_method",
            })
          : new Response(null, { status: 200 })
      );
    };

    await makeStripeCardPaymentsTestControl(
      "sk_test_from_input",
      request
    ).cancel("pi/from-input");

    expect(requests).toStrictEqual([
      {
        init: {
          headers: { Authorization: "Bearer sk_test_from_input" },
        },
        input: "https://api.stripe.com/v1/payment_intents/pi%2Ffrom-input",
      },
      {
        init: {
          headers: { Authorization: "Bearer sk_test_from_input" },
          method: "POST",
        },
        input:
          "https://api.stripe.com/v1/payment_intents/pi%2Ffrom-input/cancel",
      },
    ]);
  });
});
