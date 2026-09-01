import type {
  ByProjectKeyRequestBuilder,
  Payment,
  PaymentDraft,
  PaymentUpdateAction,
} from "@commercetools/platform-sdk";
import {
  PaymentConfirmationReference,
  PaymentProviderFailure,
  PaymentProvider,
  PaymentProviderReference,
  PaymentRepository,
  PaymentReference,
} from "@repo/payments";
import type { CardPaymentRecord, PaymentCheckout } from "@repo/payments";
import { Effect, Layer, Option, Schema } from "effect";

import { CommercetoolsRestClient } from "../client/rest-client";
import {
  commercetoolsProviderFailureReason,
  hasCommercetoolsErrorCode,
  isConcurrentModification,
} from "../client/versioned-write";
import {
  CHECKOUT_PAYMENT_CUSTOM_FIELD_NAMES,
  PAYMENT_CONFIRMATION_REFERENCE_FIELD,
  PAYMENT_CUSTOM_TYPE_KEY,
  PAYMENT_TERMS_IN_DAYS_FIELD,
} from "./custom-fields";
import {
  cardPaymentKeyForCheckout,
  netTermsPaymentKeyForCheckout,
} from "./keys";

const paymentFailure = (
  operation: string,
  cause: unknown,
  reason: PaymentProviderFailure["reason"] = "unavailable"
) => new PaymentProviderFailure({ cause, operation, reason });

const ProviderHttpFailure = Schema.Struct({ statusCode: Schema.Finite });

const isNotFound = (error: PaymentProviderFailure) =>
  Option.getOrUndefined(
    Schema.decodeUnknownOption(ProviderHttpFailure)(error.cause)
  )?.statusCode === 404;

const providerRequest = <A>(operation: string, request: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) =>
      paymentFailure(
        operation,
        cause,
        commercetoolsProviderFailureReason(cause)
      ),
    try: request,
  });

const findPaymentByKey = (apiRoot: ByProjectKeyRequestBuilder, key: string) =>
  providerRequest("payment.read", async () => {
    const response = await apiRoot.payments().withKey({ key }).get().execute();
    return response.body;
  }).pipe(
    Effect.map(Option.some),
    Effect.catch((error) =>
      isNotFound(error)
        ? Effect.succeed(Option.none<Payment>())
        : Effect.fail(error)
    )
  );

interface DesiredPayment {
  readonly checkout: PaymentCheckout;
  readonly customFields?: Readonly<Record<string, number | string>>;
  readonly interfaceId: string;
  readonly key: string;
  readonly method: "card" | "netTerms";
  readonly name: string;
  readonly paymentInterface: string;
}

const customFieldsFor = (desired: DesiredPayment) => desired.customFields ?? {};

const PaymentCustomFields = Schema.Record(
  Schema.String,
  Schema.Union([Schema.String, Schema.Finite])
);

const paymentCustomFields = (payment: Payment) =>
  Schema.decodeUnknownOption(PaymentCustomFields)(payment.custom?.fields);

const EMPTY_PAYMENT_CUSTOM_FIELDS: Readonly<Record<string, number | string>> =
  {};

const paymentCustomFieldsOrEmpty = (payment: Payment) =>
  Option.getOrElse(
    paymentCustomFields(payment),
    () => EMPTY_PAYMENT_CUSTOM_FIELDS
  );

const hasCheckoutPaymentCustomType = (payment: Payment) =>
  Option.match(paymentCustomFields(payment), {
    onNone: () => false,
    onSome: (fields) =>
      Object.keys(fields).every((fieldName) =>
        CHECKOUT_PAYMENT_CUSTOM_FIELD_NAMES.has(fieldName)
      ),
  });

const customFieldsMatch = (payment: Payment, desired: DesiredPayment) =>
  Option.match(paymentCustomFields(payment), {
    onNone: () => Object.keys(customFieldsFor(desired)).length === 0,
    onSome: (fields) =>
      Object.entries(customFieldsFor(desired)).every(
        ([fieldName, value]) => fields[fieldName] === value
      ),
  });

const customFieldActions = (
  payment: Payment,
  desired: DesiredPayment
): Effect.Effect<readonly PaymentUpdateAction[], PaymentProviderFailure> => {
  const fields = customFieldsFor(desired);
  if (payment.custom === undefined) {
    return Effect.succeed([
      {
        action: "setCustomType",
        fields,
        type: { key: PAYMENT_CUSTOM_TYPE_KEY, typeId: "type" },
      },
    ]);
  }
  if (!hasCheckoutPaymentCustomType(payment)) {
    return Effect.fail(
      paymentFailure(
        "payment.update",
        new Error("Payment carries an incompatible Custom Type"),
        "invalidData"
      )
    );
  }
  if (customFieldsMatch(payment, desired)) {
    return Effect.succeed([]);
  }
  const currentFields = paymentCustomFieldsOrEmpty(payment);
  return Effect.succeed(
    Object.entries(fields).flatMap(([name, value]) =>
      currentFields[name] === value
        ? []
        : [{ action: "setCustomField" as const, name, value }]
    )
  );
};

const createPayment = (
  apiRoot: ByProjectKeyRequestBuilder,
  input: DesiredPayment
) =>
  providerRequest("payment.create", async () => {
    const paymentDraft: PaymentDraft = {
      amountPlanned: input.checkout.amount,
      interfaceId: input.interfaceId,
      key: input.key,
      paymentMethodInfo: {
        method: input.method,
        name: { "en-US": input.name },
        paymentInterface: input.paymentInterface,
      },
    };
    const body: PaymentDraft = {
      ...paymentDraft,
      custom: {
        fields: customFieldsFor(input),
        type: { key: PAYMENT_CUSTOM_TYPE_KEY, typeId: "type" },
      },
    };
    const response = await apiRoot.payments().post({ body }).execute();
    return response.body;
  });

const updatePayment = (
  apiRoot: ByProjectKeyRequestBuilder,
  payment: Payment,
  desired: DesiredPayment
): Effect.Effect<Payment, PaymentProviderFailure> => {
  if (
    (payment.interfaceId !== undefined &&
      payment.interfaceId !== desired.interfaceId) ||
    (payment.paymentMethodInfo.paymentInterface !== undefined &&
      payment.paymentMethodInfo.paymentInterface !== desired.paymentInterface)
  ) {
    return Effect.fail(
      paymentFailure(
        "payment.update",
        new Error("Payment belongs to another provider identity"),
        "invalidData"
      )
    );
  }

  const methodInfoChanged =
    payment.paymentMethodInfo.method !== desired.method ||
    payment.paymentMethodInfo.name?.["en-US"] !== desired.name ||
    payment.paymentMethodInfo.paymentInterface === undefined;
  const amountChanged =
    payment.amountPlanned.centAmount !== desired.checkout.amount.centAmount ||
    payment.amountPlanned.currencyCode !== desired.checkout.amount.currencyCode;
  const hasFinancialProgress = payment.transactions.some(
    (transaction) => transaction.state !== "Failure"
  );
  if (amountChanged && hasFinancialProgress) {
    return Effect.fail(
      paymentFailure(
        "payment.update",
        new Error("Payment amount cannot change after financial progress"),
        "invalidData"
      )
    );
  }
  const methodInfoActions: PaymentUpdateAction[] = [];
  if (methodInfoChanged) {
    methodInfoActions.push(
      payment.paymentMethodInfo.paymentInterface === undefined
        ? {
            action: "setMethodInfo",
            method: desired.method,
            name: { "en-US": desired.name },
            paymentInterface: desired.paymentInterface,
          }
        : {
            action: "setMethodInfo",
            method: desired.method,
            name: { "en-US": desired.name },
          }
    );
  }
  return customFieldActions(payment, desired).pipe(
    Effect.flatMap((customActions) => {
      const actions: PaymentUpdateAction[] = [
        ...(amountChanged
          ? [
              {
                action: "changeAmountPlanned" as const,
                amount: desired.checkout.amount,
              },
            ]
          : []),
        ...(payment.interfaceId === desired.interfaceId
          ? []
          : [
              {
                action: "setInterfaceId" as const,
                interfaceId: desired.interfaceId,
              },
            ]),
        ...methodInfoActions,
        ...customActions,
      ];
      if (actions.length === 0) {
        return Effect.succeed(payment);
      }

      return providerRequest("payment.update", async () => {
        const response = await apiRoot
          .payments()
          .withId({ ID: payment.id })
          .post({ body: { actions, version: payment.version } })
          .execute();
        return response.body;
      });
    })
  );
};

const requireDesiredPayment = (
  payment: Payment,
  desired: DesiredPayment
): Effect.Effect<Payment, PaymentProviderFailure> =>
  payment.amountPlanned.centAmount === desired.checkout.amount.centAmount &&
  payment.amountPlanned.currencyCode === desired.checkout.amount.currencyCode &&
  payment.interfaceId === desired.interfaceId &&
  payment.paymentMethodInfo.method === desired.method &&
  payment.paymentMethodInfo.name?.["en-US"] === desired.name &&
  payment.paymentMethodInfo.paymentInterface === desired.paymentInterface &&
  customFieldsMatch(payment, desired)
    ? Effect.succeed(payment)
    : Effect.fail(
        paymentFailure(
          "payment.save",
          new Error("Saved Payment does not match the requested state"),
          "invalidData"
        )
      );

const isReconciliationConflict = (failure: PaymentProviderFailure) =>
  isConcurrentModification(failure.cause) ||
  hasCommercetoolsErrorCode(
    failure.cause,
    "DuplicateField",
    "DuplicateFieldWithConflictingResource"
  );

const PAYMENT_RECONCILIATION_RETRIES = 1;

const ensurePayment = (
  apiRoot: ByProjectKeyRequestBuilder,
  desired: DesiredPayment,
  remainingRetries = PAYMENT_RECONCILIATION_RETRIES
): Effect.Effect<Payment, PaymentProviderFailure> =>
  findPaymentByKey(apiRoot, desired.key).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => createPayment(apiRoot, desired),
        onSome: (payment) => updatePayment(apiRoot, payment, desired),
      })
    ),
    Effect.flatMap((payment) => requireDesiredPayment(payment, desired)),
    Effect.catch((error) =>
      remainingRetries > 0 && isReconciliationConflict(error)
        ? ensurePayment(apiRoot, desired, remainingRetries - 1)
        : Effect.fail(error)
    )
  );

const requireCardPaymentRecord = (
  payment: Payment
): Effect.Effect<CardPaymentRecord, PaymentProviderFailure> => {
  const provider = payment.paymentMethodInfo.paymentInterface;
  const confirmationReferenceValue =
    paymentCustomFieldsOrEmpty(payment)[PAYMENT_CONFIRMATION_REFERENCE_FIELD];
  const confirmationReference =
    confirmationReferenceValue === undefined
      ? Option.none()
      : Schema.decodeUnknownOption(PaymentConfirmationReference)(
          confirmationReferenceValue
        );
  if (payment.interfaceId === undefined || provider === undefined) {
    return Effect.fail(
      paymentFailure(
        "payment.read",
        new Error("Card Payment has no provider identity"),
        "invalidData"
      )
    );
  }
  if (
    confirmationReferenceValue !== undefined &&
    Option.isNone(confirmationReference)
  ) {
    return Effect.fail(
      paymentFailure(
        "payment.read",
        new Error("Card Payment has an invalid confirmation reference"),
        "invalidData"
      )
    );
  }
  const common = {
    paymentReference: PaymentReference.make(payment.id),
    provider: PaymentProvider.make(provider),
    providerReference: PaymentProviderReference.make(payment.interfaceId),
  };
  return Effect.succeed(
    Option.isNone(confirmationReference)
      ? common
      : { ...common, confirmationReference: confirmationReference.value }
  );
};

export const paymentRepositoryLayerFrom = (
  apiRoot: ByProjectKeyRequestBuilder
) =>
  Layer.succeed(
    PaymentRepository,
    PaymentRepository.of({
      findCard: Effect.fn("CommercetoolsPaymentRepository.findCard")(
        (checkoutReference) =>
          findPaymentByKey(
            apiRoot,
            cardPaymentKeyForCheckout(checkoutReference)
          ).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.succeed(Option.none()),
                onSome: (payment) =>
                  requireCardPaymentRecord(payment).pipe(
                    Effect.map(Option.some)
                  ),
              })
            )
          )
      ),
      saveCard: Effect.fn("CommercetoolsPaymentRepository.saveCard")(
        (input) => {
          const key = cardPaymentKeyForCheckout(input.checkout.reference);
          const desired: DesiredPayment = {
            checkout: input.checkout,
            interfaceId: input.providerReference,
            key,
            method: "card",
            name: "Card",
            paymentInterface: input.provider,
          };
          const selected: DesiredPayment =
            input.confirmationReference === undefined
              ? desired
              : {
                  ...desired,
                  customFields: {
                    [PAYMENT_CONFIRMATION_REFERENCE_FIELD]:
                      input.confirmationReference,
                  },
                };
          return ensurePayment(apiRoot, selected).pipe(
            Effect.map((payment) => PaymentReference.make(payment.id))
          );
        }
      ),
      saveNetTerms: Effect.fn("CommercetoolsPaymentRepository.saveNetTerms")(
        (input) => {
          const key = netTermsPaymentKeyForCheckout(input.checkout.reference);
          return ensurePayment(apiRoot, {
            checkout: input.checkout,
            customFields: {
              [PAYMENT_TERMS_IN_DAYS_FIELD]: input.termsInDays,
            },
            interfaceId: key,
            key,
            method: "netTerms",
            name: `Net ${input.termsInDays}`,
            paymentInterface: input.provider,
          }).pipe(Effect.map((payment) => PaymentReference.make(payment.id)));
        }
      ),
    })
  );

export const paymentRepositoryLayer = Layer.unwrap(
  CommercetoolsRestClient.pipe(
    Effect.map(({ apiRoot }) => paymentRepositoryLayerFrom(apiRoot))
  )
);
