import "server-only";
import {
  CardPayments,
  CardBrand,
  CardLastFour,
  PaymentConfirmationUnavailable,
  PaymentOperationDeclined,
  PaymentProvider,
  PaymentProviderFailure,
  PaymentProviderReference,
  PaymentProviderTransactionReference,
} from "@repo/payments";
import type {
  AuthorizeCardPaymentInput,
  CompleteCardPaymentInput,
  PaymentConfirmationReference,
  PrepareCardPaymentInput,
  ValidateCardConfirmationInput,
} from "@repo/payments";
import { Clock, Config, Effect, Layer, Schema } from "effect";
import type { Redacted } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";

const StripeCharge = Schema.Struct({
  balance_transaction: Schema.optional(
    Schema.NullOr(
      Schema.Union([Schema.String, Schema.Struct({ id: Schema.String })])
    )
  ),
  id: Schema.String,
  payment_method_details: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        card: Schema.optional(
          Schema.NullOr(
            Schema.Struct({
              brand: Schema.String,
              last4: Schema.String,
            })
          )
        ),
        type: Schema.String,
      })
    )
  ),
});
type StripeCharge = typeof StripeCharge.Type;

const StripePaymentIntent = Schema.Struct({
  amount: Schema.Int,
  capture_method: Schema.String,
  client_secret: Schema.NullOr(Schema.String),
  confirmation_method: Schema.String,
  currency: Schema.String,
  id: Schema.String,
  last_payment_error: Schema.optional(
    Schema.NullOr(Schema.Struct({ message: Schema.optional(Schema.String) }))
  ),
  latest_charge: Schema.optional(
    Schema.NullOr(Schema.Union([Schema.String, StripeCharge]))
  ),
  metadata: Schema.Struct({ checkout_reference: Schema.String }),
  payment_method_options: Schema.Struct({
    card: Schema.Struct({ capture_method: Schema.String }),
  }),
  payment_method_types: Schema.Array(Schema.String),
  status: Schema.String,
});
type StripePaymentIntent = typeof StripePaymentIntent.Type;

const StripeConfirmationToken = Schema.Struct({
  expires_at: Schema.NullOr(Schema.Int),
  id: Schema.String,
  payment_intent: Schema.NullOr(Schema.String),
  payment_method_preview: Schema.NullOr(Schema.Struct({ type: Schema.String })),
});
type StripeConfirmationToken = typeof StripeConfirmationToken.Type;

interface StripeConfig {
  readonly publishableKey: string;
  readonly secretKey: Redacted.Redacted;
}

const stripeFailure = (
  operation: string,
  cause: unknown,
  reason: PaymentProviderFailure["reason"]
) => new PaymentProviderFailure({ cause, operation, reason });

const loadConfig = Config.all({
  publishableKey: Config.schema(
    Schema.NonEmptyString,
    "STRIPE_PUBLISHABLE_KEY"
  ),
  secretKey: Config.schema(
    Schema.Redacted(Schema.NonEmptyString),
    "STRIPE_SECRET_KEY"
  ),
});

const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const PRE_AUTHORIZATION_STATUSES = new Set([
  "requires_confirmation",
  "requires_payment_method",
]);
const BROWSER_ACTION_SETTLEMENT_DELAY = "250 millis";
const BROWSER_ACTION_SETTLEMENT_RECHECKS = 4;
const STRIPE_PAYMENT_PROVIDER = PaymentProvider.make("Stripe");

const stripeFailureReason = (
  cause: unknown,
  outcomeCanBeUnknown: boolean
): PaymentProviderFailure["reason"] => {
  if (Schema.isSchemaError(cause)) {
    return outcomeCanBeUnknown ? "outcomeUnknown" : "invalidData";
  }
  if (!HttpClientError.isHttpClientError(cause)) {
    return outcomeCanBeUnknown ? "outcomeUnknown" : "unexpectedResponse";
  }
  if (cause.reason._tag === "TransportError") {
    return outcomeCanBeUnknown ? "outcomeUnknown" : "unavailable";
  }
  if (cause.reason._tag === "StatusCodeError") {
    if (!TRANSIENT_HTTP_STATUSES.has(cause.reason.response.status)) {
      return "unexpectedResponse";
    }
    return outcomeCanBeUnknown ? "outcomeUnknown" : "unavailable";
  }
  if (
    cause.reason._tag === "DecodeError" ||
    cause.reason._tag === "EmptyBodyError"
  ) {
    return outcomeCanBeUnknown ? "outcomeUnknown" : "invalidData";
  }
  return "unexpectedResponse";
};

const stripeRequestWithMetadata = <Response, Encoded>(
  http: HttpClient.HttpClient,
  config: StripeConfig,
  operation: string,
  path: string,
  responseSchema: Schema.Codec<Response, Encoded>,
  input: {
    readonly body?: URLSearchParams;
    readonly idempotencyKey?: string;
    readonly method: "GET" | "POST";
    readonly outcomeCanBeUnknown?: boolean;
  }
): Effect.Effect<
  {
    readonly body: Response;
    readonly requestId?: string;
  },
  PaymentProviderFailure
> =>
  Effect.gen(function* () {
    const client = HttpClient.filterStatusOk(http);
    let request = HttpClientRequest.make(input.method)(
      `https://api.stripe.com/v1${path}`
    ).pipe(HttpClientRequest.bearerToken(config.secretKey));
    if (input.body !== undefined) {
      request = HttpClientRequest.bodyUrlParams(request, input.body);
    }
    if (input.idempotencyKey !== undefined) {
      request = HttpClientRequest.setHeader(
        request,
        "Idempotency-Key",
        input.idempotencyKey
      );
    }
    const response = yield* client.execute(request);
    const body =
      yield* HttpClientResponse.schemaBodyJson(responseSchema)(response);
    const requestId = response.headers["request-id"];
    return requestId === undefined ? { body } : { body, requestId };
  }).pipe(
    Effect.mapError((cause) =>
      stripeFailure(
        operation,
        cause,
        stripeFailureReason(cause, input.outcomeCanBeUnknown === true)
      )
    )
  );

const stripeRequest = <Response, Encoded>(
  http: HttpClient.HttpClient,
  config: StripeConfig,
  operation: string,
  path: string,
  responseSchema: Schema.Codec<Response, Encoded>,
  input: {
    readonly body?: URLSearchParams;
    readonly idempotencyKey?: string;
    readonly method: "GET" | "POST";
    readonly outcomeCanBeUnknown?: boolean;
  }
) =>
  stripeRequestWithMetadata(
    http,
    config,
    operation,
    path,
    responseSchema,
    input
  ).pipe(Effect.map(({ body }) => body));

const createPaymentIntent = (
  http: HttpClient.HttpClient,
  config: StripeConfig,
  input: PrepareCardPaymentInput
) =>
  stripeRequest(
    http,
    config,
    "stripe.paymentIntent.create",
    "/payment_intents",
    StripePaymentIntent,
    {
      body: new URLSearchParams({
        amount: String(input.checkout.amount.centAmount),
        confirmation_method: "automatic",
        currency: input.checkout.amount.currencyCode.toLowerCase(),
        "metadata[checkout_reference]": input.checkout.reference,
        "payment_method_options[card][capture_method]": "manual",
        "payment_method_types[]": "card",
      }),
      idempotencyKey: `checkout-card-${input.checkout.reference}:${input.checkout.amount.currencyCode}:${input.checkout.amount.centAmount}${
        input.providerReference === undefined
          ? ""
          : `:renew:${input.providerReference}`
      }`,
      method: "POST",
      outcomeCanBeUnknown: true,
    }
  );

const getPaymentIntent = (
  http: HttpClient.HttpClient,
  config: StripeConfig,
  reference: string
) =>
  stripeRequest(
    http,
    config,
    "stripe.paymentIntent.read",
    `/payment_intents/${encodeURIComponent(reference)}?expand%5B%5D=latest_charge.balance_transaction`,
    StripePaymentIntent,
    { method: "GET" }
  );

const invalidPaymentIntent = (
  operation: string,
  message: string
): Effect.Effect<never, PaymentProviderFailure> =>
  Effect.fail(stripeFailure(operation, new Error(message), "invalidData"));

const requireCurrentPreparation = (
  operation: string,
  intent: StripePaymentIntent,
  input: PrepareCardPaymentInput
): Effect.Effect<StripePaymentIntent, PaymentProviderFailure> => {
  if (
    intent.confirmation_method !== "automatic" ||
    intent.metadata.checkout_reference !== input.checkout.reference ||
    intent.payment_method_options.card.capture_method !== "manual" ||
    intent.payment_method_types.length !== 1 ||
    intent.payment_method_types[0] !== "card" ||
    !PRE_AUTHORIZATION_STATUSES.has(intent.status)
  ) {
    return invalidPaymentIntent(
      operation,
      "PaymentIntent does not represent the current Checkout preparation"
    );
  }
  return Effect.succeed(intent);
};

const requirePreparedAmount = (
  operation: string,
  intent: StripePaymentIntent,
  input: PrepareCardPaymentInput
): Effect.Effect<StripePaymentIntent, PaymentProviderFailure> => {
  const currency = input.checkout.amount.currencyCode.toLowerCase();
  return intent.amount === input.checkout.amount.centAmount &&
    intent.currency === currency
    ? Effect.succeed(intent)
    : invalidPaymentIntent(
        operation,
        "PaymentIntent amount does not match the current Checkout"
      );
};

const requirePaymentIntentIdentity = (
  operation: string,
  intent: StripePaymentIntent,
  checkout: PrepareCardPaymentInput["checkout"]
) => {
  if (
    intent.confirmation_method !== "automatic" ||
    intent.metadata.checkout_reference !== checkout.reference ||
    intent.payment_method_options.card.capture_method !== "manual" ||
    intent.payment_method_types.length !== 1 ||
    intent.payment_method_types[0] !== "card" ||
    intent.amount !== checkout.amount.centAmount ||
    intent.currency !== checkout.amount.currencyCode.toLowerCase()
  ) {
    return invalidPaymentIntent(
      operation,
      "PaymentIntent does not belong to the current Checkout payment"
    );
  }
  return Effect.succeed(intent);
};

const cardDeclined = (
  operation: "authorize" | "capture",
  intent: StripePaymentIntent
) =>
  new PaymentOperationDeclined({
    message:
      intent.last_payment_error?.message ??
      `Card ${operation} was not accepted by Stripe`,
    operation,
  });

const requireClientSecret = (intent: StripePaymentIntent) =>
  intent.client_secret === null
    ? Effect.fail(
        stripeFailure(
          "stripe.paymentIntent.read",
          new Error("Stripe PaymentIntent did not return a client secret"),
          "invalidData"
        )
      )
    : Effect.succeed(intent.client_secret);

const requireExpandedCharge = (
  operation: string,
  intent: StripePaymentIntent
): Effect.Effect<StripeCharge, PaymentProviderFailure> =>
  Schema.is(StripeCharge)(intent.latest_charge)
    ? Effect.succeed(intent.latest_charge)
    : invalidPaymentIntent(
        operation,
        "Stripe did not return the expanded Charge for an authorized PaymentIntent"
      );

const cardPaymentMethodFrom = (operation: string, charge: StripeCharge) => {
  const details = charge.payment_method_details;
  const card = details?.type === "card" ? details.card : undefined;
  return card === null || card === undefined
    ? invalidPaymentIntent(
        operation,
        "Stripe did not return Card display details for the authorized Charge"
      )
    : Schema.decodeEffect(
        Schema.Struct({
          cardBrand: CardBrand,
          lastFour: CardLastFour,
          method: Schema.Literal("card"),
        })
      )({
        cardBrand: card.brand,
        lastFour: card.last4,
        method: "card",
      }).pipe(
        Effect.mapError((cause) =>
          stripeFailure(operation, cause, "invalidData")
        )
      );
};

const paymentOperationReferenceFrom = (
  charge: StripeCharge,
  requestId?: string
) => {
  const balanceTransaction = charge.balance_transaction;
  let reference = requestId;
  if (Schema.is(Schema.String)(balanceTransaction)) {
    reference = balanceTransaction;
  } else if (balanceTransaction !== null && balanceTransaction !== undefined) {
    reference = balanceTransaction.id;
  }
  return reference === undefined
    ? {}
    : {
        providerTransactionReference:
          PaymentProviderTransactionReference.make(reference),
      };
};

const authorizationFromIntent = Effect.fn(
  "StripeCardPayments.authorizationFromIntent"
)(function* (intent: StripePaymentIntent, publicConfiguration: string) {
  if (intent.status === "requires_capture" || intent.status === "succeeded") {
    const charge = yield* requireExpandedCharge(
      "stripe.paymentIntent.confirm",
      intent
    );
    return {
      _tag: "Authorized" as const,
      paymentMethod: yield* cardPaymentMethodFrom(
        "stripe.paymentIntent.confirm",
        charge
      ),
      providerTransactionReference: PaymentProviderTransactionReference.make(
        charge.id
      ),
    };
  }
  if (intent.status === "requires_action") {
    const clientToken = yield* requireClientSecret(intent);
    return {
      _tag: "ActionRequired" as const,
      clientToken,
      provider: STRIPE_PAYMENT_PROVIDER,
      publicConfiguration,
    };
  }
  if (
    intent.status === "requires_payment_method" ||
    intent.status === "canceled"
  ) {
    return yield* cardDeclined("authorize", intent);
  }
  return yield* invalidPaymentIntent(
    "stripe.paymentIntent.confirm",
    `PaymentIntent returned unsupported authorization status ${intent.status}`
  );
});

const confirmPaymentIntent = (
  http: HttpClient.HttpClient,
  config: StripeConfig,
  input: AuthorizeCardPaymentInput
) =>
  stripeRequest(
    http,
    config,
    "stripe.paymentIntent.confirm",
    `/payment_intents/${encodeURIComponent(input.providerReference)}/confirm`,
    StripePaymentIntent,
    {
      body: new URLSearchParams({
        confirmation_token: input.confirmationReference,
        "expand[]": "latest_charge.balance_transaction",
        use_stripe_sdk: "true",
      }),
      idempotencyKey: input.operationReference,
      method: "POST",
      outcomeCanBeUnknown: true,
    }
  );

const capturePaymentIntent = (
  http: HttpClient.HttpClient,
  config: StripeConfig,
  input: CompleteCardPaymentInput
) =>
  stripeRequestWithMetadata(
    http,
    config,
    "stripe.paymentIntent.capture",
    `/payment_intents/${encodeURIComponent(input.providerReference)}/capture`,
    StripePaymentIntent,
    {
      body: new URLSearchParams({
        "expand[]": "latest_charge.balance_transaction",
      }),
      idempotencyKey: input.operationReference,
      method: "POST",
      outcomeCanBeUnknown: true,
    }
  );

const cancelPaymentIntent = (
  http: HttpClient.HttpClient,
  config: StripeConfig,
  input: CompleteCardPaymentInput
) =>
  stripeRequestWithMetadata(
    http,
    config,
    "stripe.paymentIntent.cancel",
    `/payment_intents/${encodeURIComponent(input.providerReference)}/cancel`,
    StripePaymentIntent,
    {
      idempotencyKey: input.operationReference,
      method: "POST",
      outcomeCanBeUnknown: true,
    }
  );

const synchronizePaymentIntent = (
  http: HttpClient.HttpClient,
  config: StripeConfig,
  intent: StripePaymentIntent,
  input: PrepareCardPaymentInput
): Effect.Effect<StripePaymentIntent, PaymentProviderFailure> => {
  const currency = input.checkout.amount.currencyCode.toLowerCase();
  return requireCurrentPreparation(
    "stripe.paymentIntent.read",
    intent,
    input
  ).pipe(
    Effect.flatMap((current) => {
      if (
        current.amount === input.checkout.amount.centAmount &&
        current.currency === currency
      ) {
        return Effect.succeed(current);
      }
      if (current.currency !== currency) {
        return invalidPaymentIntent(
          "stripe.paymentIntent.update",
          "PaymentIntent currency cannot be synchronized"
        );
      }

      return stripeRequest(
        http,
        config,
        "stripe.paymentIntent.update",
        `/payment_intents/${encodeURIComponent(current.id)}`,
        StripePaymentIntent,
        {
          body: new URLSearchParams({
            amount: String(input.checkout.amount.centAmount),
          }),
          method: "POST",
          outcomeCanBeUnknown: true,
        }
      ).pipe(
        Effect.flatMap((updated) =>
          requireCurrentPreparation(
            "stripe.paymentIntent.update",
            updated,
            input
          )
        ),
        Effect.flatMap((updated) =>
          requirePreparedAmount("stripe.paymentIntent.update", updated, input)
        )
      );
    })
  );
};

const confirmationUnavailable = (
  input: ValidateCardConfirmationInput,
  reason: PaymentConfirmationUnavailable["reason"]
) =>
  new PaymentConfirmationUnavailable({
    confirmationReference: input.confirmationReference,
    reason,
  });

const isNotFoundFailure = (error: PaymentProviderFailure) => {
  const { cause } = error;
  return (
    HttpClientError.isHttpClientError(cause) &&
    cause.reason._tag === "StatusCodeError" &&
    cause.reason.response.status === 404
  );
};

const getConfirmationToken = (
  http: HttpClient.HttpClient,
  config: StripeConfig,
  confirmationReference: PaymentConfirmationReference
) =>
  stripeRequest(
    http,
    config,
    "stripe.confirmationToken.read",
    `/confirmation_tokens/${encodeURIComponent(confirmationReference)}`,
    StripeConfirmationToken,
    { method: "GET" }
  );

const requireAvailableConfirmation = (
  token: StripeConfirmationToken,
  input: ValidateCardConfirmationInput
) =>
  Effect.gen(function* () {
    if (token.id !== input.confirmationReference) {
      return yield* stripeFailure(
        "stripe.confirmationToken.read",
        new Error("Stripe returned a different ConfirmationToken"),
        "invalidData"
      );
    }
    if (token.payment_intent !== null) {
      return yield* confirmationUnavailable(input, "alreadyUsed");
    }
    const now = yield* Clock.currentTimeMillis;
    if (token.expires_at !== null && token.expires_at * 1000 <= now) {
      return yield* confirmationUnavailable(input, "expired");
    }
    if (token.payment_method_preview?.type !== "card") {
      return yield* confirmationUnavailable(input, "unsupportedPaymentMethod");
    }
  });

export const stripeCardPaymentsLayerWithHttp = Layer.effect(
  CardPayments,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const config = yield* loadConfig.pipe(Effect.orDie);
    const prepare = Effect.fn("StripeCardPayments.prepare")(
      (input: PrepareCardPaymentInput) =>
        Effect.gen(function* () {
          const current =
            input.providerReference === undefined
              ? yield* createPaymentIntent(http, config, input)
              : yield* getPaymentIntent(http, config, input.providerReference);
          let intent: StripePaymentIntent;
          if (input.providerReference === undefined) {
            intent = yield* requireCurrentPreparation(
              "stripe.paymentIntent.create",
              current,
              input
            ).pipe(
              Effect.flatMap((created) =>
                requirePreparedAmount(
                  "stripe.paymentIntent.create",
                  created,
                  input
                )
              )
            );
          } else if (current.status === "canceled") {
            intent = yield* createPaymentIntent(http, config, input).pipe(
              Effect.flatMap((created) =>
                requireCurrentPreparation(
                  "stripe.paymentIntent.create",
                  created,
                  input
                )
              ),
              Effect.flatMap((created) =>
                requirePreparedAmount(
                  "stripe.paymentIntent.create",
                  created,
                  input
                )
              )
            );
          } else {
            intent = yield* synchronizePaymentIntent(
              http,
              config,
              current,
              input
            );
          }
          const clientToken = yield* requireClientSecret(intent);

          return {
            clientToken,
            providerReference: PaymentProviderReference.make(intent.id),
            publicConfiguration: config.publishableKey,
          };
        })
    );

    const validateConfirmation = Effect.fn(
      "StripeCardPayments.validateConfirmation"
    )((input: ValidateCardConfirmationInput) =>
      getConfirmationToken(http, config, input.confirmationReference).pipe(
        Effect.mapError((error) =>
          isNotFoundFailure(error)
            ? confirmationUnavailable(input, "notFound")
            : error
        ),
        Effect.flatMap((token) => requireAvailableConfirmation(token, input))
      )
    );

    const authorize = Effect.fn("StripeCardPayments.authorize")(
      (input: AuthorizeCardPaymentInput) =>
        Effect.gen(function* () {
          const readCurrent = () =>
            getPaymentIntent(http, config, input.providerReference).pipe(
              Effect.flatMap((intent) =>
                requirePaymentIntentIdentity(
                  "stripe.paymentIntent.read",
                  intent,
                  input.checkout
                )
              )
            );
          let current = yield* readCurrent();
          const wasAwaitingBrowserAction = current.status === "requires_action";
          if (wasAwaitingBrowserAction) {
            for (
              let recheck = 0;
              recheck < BROWSER_ACTION_SETTLEMENT_RECHECKS &&
              current.status === "requires_action";
              recheck += 1
            ) {
              yield* Effect.sleep(BROWSER_ACTION_SETTLEMENT_DELAY);
              current = yield* readCurrent();
            }
          }
          if (
            current.status === "requires_capture" ||
            current.status === "requires_action" ||
            current.status === "succeeded"
          ) {
            return yield* authorizationFromIntent(
              current,
              config.publishableKey
            );
          }
          if (
            wasAwaitingBrowserAction &&
            PRE_AUTHORIZATION_STATUSES.has(current.status)
          ) {
            return yield* cardDeclined("authorize", current);
          }
          if (PRE_AUTHORIZATION_STATUSES.has(current.status)) {
            const confirmation = yield* getConfirmationToken(
              http,
              config,
              input.confirmationReference
            );
            if (confirmation.id !== input.confirmationReference) {
              return yield* stripeFailure(
                "stripe.confirmationToken.read",
                new Error("Stripe returned a different ConfirmationToken"),
                "invalidData"
              );
            }
            if (confirmation.payment_intent !== null) {
              if (confirmation.payment_intent !== current.id) {
                return yield* stripeFailure(
                  "stripe.confirmationToken.read",
                  new Error(
                    "Stripe ConfirmationToken belongs to a different PaymentIntent"
                  ),
                  "invalidData"
                );
              }
              return yield* cardDeclined("authorize", current);
            }
          }
          const confirmed = yield* confirmPaymentIntent(
            http,
            config,
            input
          ).pipe(
            Effect.flatMap((intent) =>
              requirePaymentIntentIdentity(
                "stripe.paymentIntent.confirm",
                intent,
                input.checkout
              )
            )
          );
          return yield* authorizationFromIntent(
            confirmed,
            config.publishableKey
          );
        })
    );

    const capture = Effect.fn("StripeCardPayments.capture")(
      (input: CompleteCardPaymentInput) =>
        Effect.gen(function* () {
          const current = yield* getPaymentIntent(
            http,
            config,
            input.providerReference
          ).pipe(
            Effect.flatMap((intent) =>
              requirePaymentIntentIdentity(
                "stripe.paymentIntent.read",
                intent,
                input.checkout
              )
            )
          );
          if (current.status === "succeeded") {
            const charge = yield* requireExpandedCharge(
              "stripe.paymentIntent.read",
              current
            );
            return paymentOperationReferenceFrom(charge);
          }
          if (current.status !== "requires_capture") {
            return yield* cardDeclined("capture", current);
          }
          const captured = yield* capturePaymentIntent(http, config, input);
          const capturedIntent = yield* requirePaymentIntentIdentity(
            "stripe.paymentIntent.capture",
            captured.body,
            input.checkout
          );
          if (capturedIntent.status !== "succeeded") {
            return yield* cardDeclined("capture", capturedIntent);
          }
          const charge = yield* requireExpandedCharge(
            "stripe.paymentIntent.capture",
            capturedIntent
          );
          return paymentOperationReferenceFrom(charge, captured.requestId);
        })
    );

    const cancelAuthorization = Effect.fn(
      "StripeCardPayments.cancelAuthorization"
    )((input: CompleteCardPaymentInput) =>
      Effect.gen(function* () {
        const current = yield* getPaymentIntent(
          http,
          config,
          input.providerReference
        ).pipe(
          Effect.flatMap((intent) =>
            requirePaymentIntentIdentity(
              "stripe.paymentIntent.read",
              intent,
              input.checkout
            )
          )
        );
        if (current.status === "canceled") {
          return {};
        }
        if (current.status !== "requires_capture") {
          return yield* invalidPaymentIntent(
            "stripe.paymentIntent.cancel",
            `PaymentIntent cannot release authorization from status ${current.status}`
          );
        }
        const cancelled = yield* cancelPaymentIntent(http, config, input);
        const cancelledIntent = yield* requirePaymentIntentIdentity(
          "stripe.paymentIntent.cancel",
          cancelled.body,
          input.checkout
        );
        if (cancelledIntent.status !== "canceled") {
          return yield* invalidPaymentIntent(
            "stripe.paymentIntent.cancel",
            "Stripe did not cancel the authorized PaymentIntent"
          );
        }
        return cancelled.requestId === undefined
          ? {}
          : {
              providerTransactionReference:
                PaymentProviderTransactionReference.make(cancelled.requestId),
            };
      })
    );

    return CardPayments.of({
      authorize,
      cancelAuthorization,
      capture,
      prepare,
      provider: STRIPE_PAYMENT_PROVIDER,
      validateConfirmation,
    });
  })
);

export const stripeCardPaymentsLayer = stripeCardPaymentsLayerWithHttp.pipe(
  Layer.provide(FetchHttpClient.layer)
);
