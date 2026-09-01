/* oxlint-disable typescript/promise-function-async -- The fetch contract double returns an already-settled Promise. */
import { describe, expect, it } from "vitest";

import { makeStripeCardPaymentsTestControl } from "./card-payments-test-control";

describe("Stripe Card Payments test control", () => {
  it("cancels the prepared PaymentIntent", async () => {
    const requests: {
      readonly init?: RequestInit;
      readonly input: RequestInfo | URL;
    }[] = [];
    const request: typeof fetch = (input, init) => {
      requests.push({ init, input });
      return Promise.resolve(new Response(null, { status: 200 }));
    };

    await makeStripeCardPaymentsTestControl(
      "sk_test_from_input",
      request
    ).cancel("pi/from-input");

    expect(requests).toStrictEqual([
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
