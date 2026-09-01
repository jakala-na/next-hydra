import "server-only";
import {
  CardPayments,
  PaymentConfirmationUnavailable,
  PaymentProvider,
  PaymentProviderFailure,
  PaymentProviderReference,
} from "@repo/payments";
import type {
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

const StripePaymentIntent = Schema.Struct({
  amount: Schema.Int,
  capture_method: Schema.String,
  client_secret: Schema.NullOr(Schema.String),
  confirmation_method: Schema.String,
  currency: Schema.String,
  id: Schema.String,
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
const STRIPE_PAYMENT_PROVIDER = PaymentProvider.make("Stripe");

const stripeFailureReason = (
  cause: unknown
): PaymentProviderFailure["reason"] => {
  if (Schema.isSchemaError(cause)) {
    return "invalidData";
  }
  if (!HttpClientError.isHttpClientError(cause)) {
    return "unexpectedResponse";
  }
  if (cause.reason._tag === "TransportError") {
    return "unavailable";
  }
  if (cause.reason._tag === "StatusCodeError") {
    return TRANSIENT_HTTP_STATUSES.has(cause.reason.response.status)
      ? "unavailable"
      : "unexpectedResponse";
  }
  return cause.reason._tag === "DecodeError" ||
    cause.reason._tag === "EmptyBodyError"
    ? "invalidData"
    : "unexpectedResponse";
};

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
  }
) =>
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
    return yield* HttpClientResponse.schemaBodyJson(responseSchema)(response);
  }).pipe(
    Effect.mapError((cause) =>
      stripeFailure(operation, cause, stripeFailureReason(cause))
    )
  );

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
      idempotencyKey: `checkout-card-${input.checkout.reference}:${input.checkout.amount.currencyCode}:${input.checkout.amount.centAmount}`,
      method: "POST",
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
    `/payment_intents/${encodeURIComponent(reference)}`,
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
          const intent =
            input.providerReference === undefined
              ? yield* requireCurrentPreparation(
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
                )
              : yield* synchronizePaymentIntent(http, config, current, input);
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
      stripeRequest(
        http,
        config,
        "stripe.confirmationToken.read",
        `/confirmation_tokens/${encodeURIComponent(input.confirmationReference)}`,
        StripeConfirmationToken,
        { method: "GET" }
      ).pipe(
        Effect.mapError((error) =>
          isNotFoundFailure(error)
            ? confirmationUnavailable(input, "notFound")
            : error
        ),
        Effect.flatMap((token) => requireAvailableConfirmation(token, input))
      )
    );

    return CardPayments.of({
      prepare,
      provider: STRIPE_PAYMENT_PROVIDER,
      validateConfirmation,
    });
  })
);

export const stripeCardPaymentsLayer = stripeCardPaymentsLayerWithHttp.pipe(
  Layer.provide(FetchHttpClient.layer)
);
