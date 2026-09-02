import {
  CardPayments,
  PaymentCheckoutReference,
  PaymentConfirmationReference,
  PaymentOperationReference,
  PaymentProviderReference,
} from "@repo/payments";
import { Cause, ConfigProvider, Effect, Exit, Layer } from "effect";
import type { HttpClientRequest } from "effect/unstable/http";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { describe, expect, it } from "vitest";

import { stripeCardPaymentsLayerWithHttp } from "./card-payments";

const requestBody = (request: HttpClientRequest.HttpClientRequest) => {
  if (request.body._tag !== "Uint8Array") {
    throw new Error(
      `Expected URL-encoded request body, received ${request.body._tag}`
    );
  }
  return new URLSearchParams(new TextDecoder().decode(request.body.body));
};

const operationCheckout = {
  amount: { centAmount: 1_700_000, currencyCode: "USD" },
  reference: PaymentCheckoutReference.make("cart-from-input"),
};

const paymentIntent = (status: string) => ({
  amount: operationCheckout.amount.centAmount,
  capture_method: "automatic_async",
  client_secret: "pi-from-provider_secret_from-provider",
  confirmation_method: "automatic",
  currency: "usd",
  id: "pi-from-provider",
  last_payment_error: null,
  latest_charge:
    status === "requires_capture" || status === "succeeded"
      ? {
          balance_transaction:
            status === "succeeded" ? "txn-from-provider" : null,
          id: "ch-from-provider",
          payment_method_details: {
            card: { brand: "visa", last4: "4242" },
            type: "card",
          },
        }
      : null,
  metadata: { checkout_reference: operationCheckout.reference },
  payment_method_options: { card: { capture_method: "manual" } },
  payment_method_types: ["card"],
  status,
});

const confirmationToken = (paymentIntentReference: null | string = null) => ({
  expires_at: 4_000_000_000,
  id: "ctoken-from-input",
  payment_intent: paymentIntentReference,
  payment_method_preview: { type: "card" },
});

const stripeConfigProvider = () =>
  ConfigProvider.fromUnknown({
    STRIPE_PUBLISHABLE_KEY: "pk_test_from_input",
    STRIPE_SECRET_KEY: "sk_test_from_input",
  });

describe("Stripe Card Payments", () => {
  it("treats non-transient Stripe responses as provider defects", async () => {
    const http = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response("Unauthorized", { status: 401 })
        )
      )
    );
    const layer = stripeCardPaymentsLayerWithHttp.pipe(
      Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
    );
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const cards = yield* CardPayments;
        return yield* cards
          .prepare({
            checkout: {
              amount: { centAmount: 1_700_000, currencyCode: "USD" },
              reference: PaymentCheckoutReference.make("cart-from-input"),
            },
          })
          .pipe(Effect.flip);
      }).pipe(
        Effect.provide(layer),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({
            STRIPE_PUBLISHABLE_KEY: "pk_test_from_input",
            STRIPE_SECRET_KEY: "sk_test_from_input",
          })
        )
      )
    );

    expect(failure).toMatchObject({
      _tag: "PaymentProviderFailure",
      reason: "unexpectedResponse",
    });
  });

  it("treats missing Stripe configuration as a defect", async () => {
    const http = HttpClient.make(() => Effect.die("HTTP must not run"));
    const layer = stripeCardPaymentsLayerWithHttp.pipe(
      Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
    );
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const cards = yield* CardPayments;
        return yield* cards.prepare({
          checkout: {
            amount: { centAmount: 1_700_000, currencyCode: "USD" },
            reference: PaymentCheckoutReference.make("cart-from-input"),
          },
        });
      }).pipe(
        Effect.provide(layer),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({})
        ),
        Effect.exit
      )
    );

    expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBeTruthy();
  });

  it.each([
    {
      STRIPE_PUBLISHABLE_KEY: "",
      STRIPE_SECRET_KEY: "sk_test_from_input",
    },
    {
      STRIPE_PUBLISHABLE_KEY: "pk_test_from_input",
      STRIPE_SECRET_KEY: "",
    },
  ])("treats empty Stripe configuration as a defect", async (configuration) => {
    const http = HttpClient.make(() => Effect.die("HTTP must not run"));
    const layer = stripeCardPaymentsLayerWithHttp.pipe(
      Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
    );
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const cards = yield* CardPayments;
        return yield* cards.prepare({
          checkout: {
            amount: { centAmount: 1_700_000, currencyCode: "USD" },
            reference: PaymentCheckoutReference.make("cart-from-input"),
          },
        });
      }).pipe(
        Effect.provide(layer),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown(configuration)
        ),
        Effect.exit
      )
    );

    expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBeTruthy();
  });

  it.each([
    {
      checkoutReference: "another-cart",
      status: "requires_payment_method",
    },
    {
      checkoutReference: "cart-from-input",
      status: "canceled",
    },
  ])(
    "rejects a reused PaymentIntent that does not belong to the current pre-authorization",
    async ({ checkoutReference, status }) => {
      const http = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json(
              {
                amount: 1_700_000,
                capture_method: "automatic_async",
                client_secret: "secret-existing",
                confirmation_method: "automatic",
                currency: "usd",
                id: "pi-existing",
                metadata: { checkout_reference: checkoutReference },
                payment_method_options: {
                  card: { capture_method: "manual" },
                },
                payment_method_types: ["card"],
                status,
              },
              { headers: { "content-type": "application/json" }, status: 200 }
            )
          )
        )
      );
      const layer = stripeCardPaymentsLayerWithHttp.pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
      );
      const failure = await Effect.runPromise(
        Effect.gen(function* () {
          const cards = yield* CardPayments;
          return yield* cards
            .prepare({
              checkout: {
                amount: { centAmount: 1_700_000, currencyCode: "USD" },
                reference: PaymentCheckoutReference.make("cart-from-input"),
              },
              providerReference: PaymentProviderReference.make("pi-existing"),
            })
            .pipe(Effect.flip);
        }).pipe(
          Effect.provide(layer),
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.fromUnknown({
              STRIPE_PUBLISHABLE_KEY: "pk_test_from_input",
              STRIPE_SECRET_KEY: "sk_test_from_input",
            })
          )
        )
      );

      expect(failure).toMatchObject({
        _tag: "PaymentProviderFailure",
        reason: "invalidData",
      });
    }
  );

  it.each([
    {
      cardCaptureMethod: "automatic",
      confirmationMethod: "automatic",
      paymentMethodTypes: ["card"],
    },
    {
      cardCaptureMethod: "manual",
      confirmationMethod: "manual",
      paymentMethodTypes: ["card"],
    },
    {
      cardCaptureMethod: "manual",
      confirmationMethod: "automatic",
      paymentMethodTypes: ["card", "link"],
    },
  ])(
    "rejects PaymentIntents with incompatible authorization mechanics",
    async ({ cardCaptureMethod, confirmationMethod, paymentMethodTypes }) => {
      const http = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json(
              {
                amount: 1_700_000,
                capture_method: "automatic_async",
                client_secret: "secret-existing",
                confirmation_method: confirmationMethod,
                currency: "usd",
                id: "pi-existing",
                metadata: { checkout_reference: "cart-from-input" },
                payment_method_options: {
                  card: { capture_method: cardCaptureMethod },
                },
                payment_method_types: paymentMethodTypes,
                status: "requires_payment_method",
              },
              { headers: { "content-type": "application/json" }, status: 200 }
            )
          )
        )
      );
      const layer = stripeCardPaymentsLayerWithHttp.pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
      );
      const failure = await Effect.runPromise(
        Effect.gen(function* () {
          const cards = yield* CardPayments;
          return yield* cards
            .prepare({
              checkout: {
                amount: { centAmount: 1_700_000, currencyCode: "USD" },
                reference: PaymentCheckoutReference.make("cart-from-input"),
              },
              providerReference: PaymentProviderReference.make("pi-existing"),
            })
            .pipe(Effect.flip);
        }).pipe(
          Effect.provide(layer),
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.fromUnknown({
              STRIPE_PUBLISHABLE_KEY: "pk_test_from_input",
              STRIPE_SECRET_KEY: "sk_test_from_input",
            })
          )
        )
      );

      expect(failure).toMatchObject({
        _tag: "PaymentProviderFailure",
        reason: "invalidData",
      });
    }
  );

  it("creates Card-only intents with amount-specific retry identities", async () => {
    const requests: HttpClientRequest.HttpClientRequest[] = [];
    const http = HttpClient.make((request) => {
      requests.push(request);
      const body = requestBody(request);
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          Response.json(
            {
              amount: Number(body.get("amount")),
              capture_method: "automatic_async",
              client_secret: `secret-${requests.length}`,
              confirmation_method: body.get("confirmation_method"),
              currency: body.get("currency"),
              id: `pi-${requests.length}`,
              metadata: {
                checkout_reference: body.get("metadata[checkout_reference]"),
              },
              payment_method_options: {
                card: {
                  capture_method: body.get(
                    "payment_method_options[card][capture_method]"
                  ),
                },
              },
              payment_method_types: body.getAll("payment_method_types[]"),
              status: "requires_payment_method",
            },
            { headers: { "content-type": "application/json" }, status: 200 }
          )
        )
      );
    });
    const layer = stripeCardPaymentsLayerWithHttp.pipe(
      Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
    );
    const configProvider = ConfigProvider.fromUnknown({
      STRIPE_PUBLISHABLE_KEY: "pk_test_from_input",
      STRIPE_SECRET_KEY: "sk_test_from_input",
    });
    const checkoutReference = PaymentCheckoutReference.make("cart-from-input");

    await Effect.runPromise(
      Effect.gen(function* () {
        const cards = yield* CardPayments;
        yield* cards.prepare({
          checkout: {
            amount: { centAmount: 1_700_000, currencyCode: "USD" },
            reference: checkoutReference,
          },
        });
        yield* cards.prepare({
          checkout: {
            amount: { centAmount: 1_725_000, currencyCode: "USD" },
            reference: checkoutReference,
          },
        });
        yield* cards.prepare({
          checkout: {
            amount: { centAmount: 1_700_000, currencyCode: "USD" },
            reference: checkoutReference,
          },
        });
      }).pipe(
        Effect.provide(layer),
        Effect.provideService(ConfigProvider.ConfigProvider, configProvider)
      )
    );

    const [first, changedAmount, repeated] = requests;
    if (
      first === undefined ||
      changedAmount === undefined ||
      repeated === undefined
    ) {
      throw new Error("Expected all Stripe create requests");
    }
    const firstKey = first.headers["idempotency-key"];
    const changedAmountKey = changedAmount.headers["idempotency-key"];
    const repeatedKey = repeated.headers["idempotency-key"];
    expect({
      cardOnly: requestBody(first).getAll("payment_method_types[]"),
      changedAmountGetsNewKey: firstKey !== changedAmountKey,
      firstKeyIsPresent: (firstKey?.length ?? 0) > 0,
      manualCapture: requestBody(first).get(
        "payment_method_options[card][capture_method]"
      ),
      paymentElementConfirmation: requestBody(first).get("confirmation_method"),
      repeatedInputReusesKey: firstKey === repeatedKey,
      usesAutomaticMethods: requestBody(first).has(
        "automatic_payment_methods[enabled]"
      ),
    }).toStrictEqual({
      cardOnly: ["card"],
      changedAmountGetsNewKey: true,
      firstKeyIsPresent: true,
      manualCapture: "manual",
      paymentElementConfirmation: "automatic",
      repeatedInputReusesKey: true,
      usesAutomaticMethods: false,
    });
  });

  it("validates an unused, unexpired Card ConfirmationToken", async () => {
    const requests: HttpClientRequest.HttpClientRequest[] = [];
    const http = HttpClient.make((request) => {
      requests.push(request);
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          Response.json(
            {
              expires_at: 4_000_000_000,
              id: "ctoken-from-input",
              payment_intent: null,
              payment_method_preview: { type: "card" },
            },
            { headers: { "content-type": "application/json" }, status: 200 }
          )
        )
      );
    });
    const layer = stripeCardPaymentsLayerWithHttp.pipe(
      Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const cards = yield* CardPayments;
        yield* cards.validateConfirmation({
          confirmationReference:
            PaymentConfirmationReference.make("ctoken-from-input"),
        });
      }).pipe(
        Effect.provide(layer),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({
            STRIPE_PUBLISHABLE_KEY: "pk_test_from-input",
            STRIPE_SECRET_KEY: "sk_test_from-input",
          })
        )
      )
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://api.stripe.com/v1/confirmation_tokens/ctoken-from-input"
    );
  });

  it.each([
    {
      expiresAt: 1,
      paymentIntent: null,
      paymentMethodType: "card",
      reason: "expired",
    },
    {
      expiresAt: 4_000_000_000,
      paymentIntent: "pi-already-confirmed",
      paymentMethodType: "card",
      reason: "alreadyUsed",
    },
    {
      expiresAt: 4_000_000_000,
      paymentIntent: null,
      paymentMethodType: "us_bank_account",
      reason: "unsupportedPaymentMethod",
    },
  ])(
    "rejects a ConfirmationToken that is $reason",
    async ({
      expiresAt,
      paymentIntent: tokenPaymentIntent,
      paymentMethodType,
      reason,
    }) => {
      const http = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json(
              {
                expires_at: expiresAt,
                id: "ctoken-from-input",
                payment_intent: tokenPaymentIntent,
                payment_method_preview: { type: paymentMethodType },
              },
              { headers: { "content-type": "application/json" }, status: 200 }
            )
          )
        )
      );
      const layer = stripeCardPaymentsLayerWithHttp.pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
      );
      const failure = await Effect.runPromise(
        Effect.gen(function* () {
          const cards = yield* CardPayments;
          return yield* cards
            .validateConfirmation({
              confirmationReference:
                PaymentConfirmationReference.make("ctoken-from-input"),
            })
            .pipe(Effect.flip);
        }).pipe(
          Effect.provide(layer),
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.fromUnknown({
              STRIPE_PUBLISHABLE_KEY: "pk_test_from-input",
              STRIPE_SECRET_KEY: "sk_test_from-input",
            })
          )
        )
      );

      expect(failure).toMatchObject({
        _tag: "PaymentConfirmationUnavailable",
        confirmationReference: "ctoken-from-input",
        reason,
      });
    }
  );

  it.each([
    {
      expected: {
        _tag: "PaymentConfirmationUnavailable",
        reason: "notFound",
      },
      status: 404,
    },
    {
      expected: { _tag: "PaymentProviderFailure", reason: "unavailable" },
      status: 503,
    },
  ])(
    "classifies a ConfirmationToken HTTP $status response",
    async ({ expected, status }) => {
      const http = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response("Stripe failure", { status })
          )
        )
      );
      const layer = stripeCardPaymentsLayerWithHttp.pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
      );
      const failure = await Effect.runPromise(
        Effect.gen(function* () {
          const cards = yield* CardPayments;
          return yield* cards
            .validateConfirmation({
              confirmationReference:
                PaymentConfirmationReference.make("ctoken-from-input"),
            })
            .pipe(Effect.flip);
        }).pipe(
          Effect.provide(layer),
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.fromUnknown({
              STRIPE_PUBLISHABLE_KEY: "pk_test_from-input",
              STRIPE_SECRET_KEY: "sk_test_from-input",
            })
          )
        )
      );

      expect(failure).toMatchObject(expected);
    }
  );

  it("confirms a prepared PaymentIntent with the stable authorization identity", async () => {
    const requests: HttpClientRequest.HttpClientRequest[] = [];
    const http = HttpClient.make((request) => {
      requests.push(request);
      const response = request.url.includes("/confirmation_tokens/")
        ? confirmationToken()
        : paymentIntent(
            request.url.endsWith("/confirm")
              ? "requires_capture"
              : "requires_payment_method"
          );
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          Response.json(response, { status: 200 })
        )
      );
    });
    const layer = stripeCardPaymentsLayerWithHttp.pipe(
      Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
    );
    const operationReference = PaymentOperationReference.make(
      "placement-from-input:authorize"
    );

    const authorization = await Effect.runPromise(
      Effect.gen(function* () {
        const cards = yield* CardPayments;
        return yield* cards.authorize({
          checkout: operationCheckout,
          confirmationReference:
            PaymentConfirmationReference.make("ctoken-from-input"),
          operationReference,
          providerReference: PaymentProviderReference.make("pi-from-provider"),
        });
      }).pipe(
        Effect.provide(layer),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          stripeConfigProvider()
        )
      )
    );

    expect(authorization).toStrictEqual({
      _tag: "Authorized",
      paymentMethod: {
        cardBrand: "visa",
        lastFour: "4242",
        method: "card",
      },
      providerTransactionReference: "ch-from-provider",
    });
    expect(requests).toHaveLength(3);
    const confirm = requests.at(2);
    if (confirm === undefined) {
      throw new Error("Expected Stripe confirmation request");
    }
    expect(confirm.headers["idempotency-key"]).toBe(operationReference);
    expect(requestBody(confirm).get("confirmation_token")).toBe(
      "ctoken-from-input"
    );
    expect(requestBody(confirm).get("use_stripe_sdk")).toBe("true");
  });

  it("rechecks browser authentication without confirming the PaymentIntent twice", async () => {
    const requests: HttpClientRequest.HttpClientRequest[] = [];
    const http = HttpClient.make((request) => {
      requests.push(request);
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          Response.json(paymentIntent("requires_action"), { status: 200 })
        )
      );
    });
    const layer = stripeCardPaymentsLayerWithHttp.pipe(
      Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
    );

    const authorization = await Effect.runPromise(
      Effect.gen(function* () {
        const cards = yield* CardPayments;
        return yield* cards.authorize({
          checkout: operationCheckout,
          confirmationReference:
            PaymentConfirmationReference.make("ctoken-from-input"),
          operationReference: PaymentOperationReference.make(
            "placement-from-input:authorize"
          ),
          providerReference: PaymentProviderReference.make("pi-from-provider"),
        });
      }).pipe(
        Effect.provide(layer),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          stripeConfigProvider()
        )
      )
    );

    expect(authorization).toStrictEqual({
      _tag: "ActionRequired",
      clientToken: "pi-from-provider_secret_from-provider",
      provider: "Stripe",
      publicConfiguration: "pk_test_from_input",
    });
    expect(requests).toHaveLength(5);
  });

  it("observes a just-cancelled browser authentication before offering it again", async () => {
    const requests: HttpClientRequest.HttpClientRequest[] = [];
    const http = HttpClient.make((request) => {
      requests.push(request);
      const status =
        requests.length === 1 ? "requires_action" : "requires_payment_method";
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          Response.json(paymentIntent(status), { status: 200 })
        )
      );
    });
    const layer = stripeCardPaymentsLayerWithHttp.pipe(
      Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
    );

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const cards = yield* CardPayments;
        return yield* cards
          .authorize({
            checkout: operationCheckout,
            confirmationReference:
              PaymentConfirmationReference.make("ctoken-from-input"),
            operationReference: PaymentOperationReference.make(
              "placement-from-input:authorize"
            ),
            providerReference:
              PaymentProviderReference.make("pi-from-provider"),
          })
          .pipe(Effect.flip);
      }).pipe(
        Effect.provide(layer),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          stripeConfigProvider()
        )
      )
    );

    expect(failure).toMatchObject({
      _tag: "PaymentOperationDeclined",
      operation: "authorize",
    });
    expect(requests).toHaveLength(2);
  });

  it("does not reuse a consumed ConfirmationToken after authentication cancellation", async () => {
    const requests: HttpClientRequest.HttpClientRequest[] = [];
    const http = HttpClient.make((request) => {
      requests.push(request);
      const response = request.url.includes("/confirmation_tokens/")
        ? confirmationToken("pi-from-provider")
        : paymentIntent("requires_payment_method");
      return Effect.succeed(
        HttpClientResponse.fromWeb(request, Response.json(response))
      );
    });
    const layer = stripeCardPaymentsLayerWithHttp.pipe(
      Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
    );

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const cards = yield* CardPayments;
        return yield* cards
          .authorize({
            checkout: operationCheckout,
            confirmationReference:
              PaymentConfirmationReference.make("ctoken-from-input"),
            operationReference: PaymentOperationReference.make(
              "placement-from-input:authorize"
            ),
            providerReference:
              PaymentProviderReference.make("pi-from-provider"),
          })
          .pipe(Effect.flip);
      }).pipe(
        Effect.provide(layer),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          stripeConfigProvider()
        )
      )
    );

    expect(failure).toMatchObject({
      _tag: "PaymentOperationDeclined",
      operation: "authorize",
    });
    expect(requests).toHaveLength(2);
    expect(
      requests.some((request) => request.url.endsWith("/confirm"))
    ).toBeFalsy();
  });

  it.each([
    { operation: "capture", terminalStatus: "succeeded" },
    { operation: "cancelAuthorization", terminalStatus: "canceled" },
  ] as const)(
    "$operation reconciles and mutates an authorized PaymentIntent idempotently",
    async ({ operation, terminalStatus }) => {
      const requests: HttpClientRequest.HttpClientRequest[] = [];
      const http = HttpClient.make((request) => {
        requests.push(request);
        const status =
          requests.length === 1 ? "requires_capture" : terminalStatus;
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json(paymentIntent(status), { status: 200 })
          )
        );
      });
      const layer = stripeCardPaymentsLayerWithHttp.pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
      );
      const operationReference = PaymentOperationReference.make(
        `placement-from-input:${operation}`
      );

      await Effect.runPromise(
        Effect.gen(function* () {
          const cards = yield* CardPayments;
          yield* cards[operation]({
            checkout: operationCheckout,
            operationReference,
            providerReference:
              PaymentProviderReference.make("pi-from-provider"),
          });
        }).pipe(
          Effect.provide(layer),
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            stripeConfigProvider()
          )
        )
      );

      expect(requests).toHaveLength(2);
      expect(requests[1]?.headers["idempotency-key"]).toBe(operationReference);
      expect(
        requests[1]?.url.endsWith(
          operation === "capture" ? "/capture" : "/cancel"
        )
      ).toBeTruthy();
    }
  );
});
