import type {
  ByProjectKeyRequestBuilder,
  Payment,
  PaymentDraft,
  PaymentUpdateAction,
} from "@commercetools/platform-sdk";
import {
  CardBrand,
  CardLastFour,
  PaymentAttemptReference,
  PaymentConfirmationReference,
  PaymentOperationReference,
  PaymentProviderFailure,
  PaymentProvider,
  PaymentProviderReference,
  PaymentProviderTransactionReference,
  PaymentRepository,
  PaymentReference,
  PaymentTransactionState,
  PaymentTransactionType,
} from "@repo/payments";
import type {
  CardPaymentRecord,
  NetTermsPaymentRecord,
  PaymentCheckout,
  PaymentRecord,
  PaymentTransaction,
  RecordPaymentTransactionInput,
} from "@repo/payments";
import { Effect, Layer, Option, Schema } from "effect";

import { CommercetoolsRestClient } from "../client/rest-client";
import {
  commercetoolsProviderFailureReason,
  hasCommercetoolsErrorCode,
  isConcurrentModification,
} from "../client/versioned-write";
import {
  customFieldsBuilder,
  customFieldsReader,
  PaymentCustomFields,
  REST_CUSTOM_TYPE_EXPANSION,
} from "../custom-fields";
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
    const response = await apiRoot
      .payments()
      .withKey({ key })
      .get({ queryArgs: { expand: REST_CUSTOM_TYPE_EXPANSION } })
      .execute();
    return response.body;
  }).pipe(
    Effect.map(Option.some),
    Effect.catch((error) =>
      isNotFound(error)
        ? Effect.succeed(Option.none<Payment>())
        : Effect.fail(error)
    )
  );

const findPaymentById = (
  apiRoot: ByProjectKeyRequestBuilder,
  paymentReference: string
) =>
  providerRequest("payment.read", async () => {
    const response = await apiRoot
      .payments()
      .withId({ ID: paymentReference })
      .get({ queryArgs: { expand: REST_CUSTOM_TYPE_EXPANSION } })
      .execute();
    return response.body;
  });

const paymentTransactions = (
  payment: Payment
): Effect.Effect<readonly PaymentTransaction[], PaymentProviderFailure> =>
  Effect.forEach(
    payment.transactions.filter(
      (transaction) =>
        transaction.interactionId !== undefined &&
        (transaction.type === "Authorization" ||
          transaction.type === "CancelAuthorization" ||
          transaction.type === "Charge") &&
        (transaction.state === "Pending" ||
          transaction.state === "Success" ||
          transaction.state === "Failure")
    ),
    (transaction) =>
      Effect.all({
        operationReference: Schema.decodeUnknownEffect(
          PaymentOperationReference
        )(transaction.interactionId),
        state: Schema.decodeUnknownEffect(PaymentTransactionState)(
          transaction.state
        ),
        type: Schema.decodeUnknownEffect(PaymentTransactionType)(
          transaction.type
        ),
      }).pipe(
        Effect.map(({ operationReference, state, type }) => {
          const mapped = {
            amount: transaction.amount,
            operationReference,
            state,
            type,
          };
          return transaction.interfaceId === undefined
            ? mapped
            : {
                ...mapped,
                providerReference: PaymentProviderTransactionReference.make(
                  transaction.interfaceId
                ),
              };
        }),
        Effect.mapError((cause) =>
          paymentFailure("payment.transactions.read", cause, "invalidData")
        )
      )
  );

type PaymentCustomFieldValues = typeof PaymentCustomFields.schema.Type;

const paymentCustomFields = (payment: Payment, operation: string) =>
  customFieldsReader
    .fromRest(PaymentCustomFields, payment.custom)
    .read.pipe(
      Effect.mapError((cause) =>
        paymentFailure(operation, cause, "invalidData")
      )
    );

const paymentCustomFieldsOrEmpty = (payment: Payment, operation: string) =>
  paymentCustomFields(payment, operation).pipe(
    Effect.map(Option.getOrElse((): PaymentCustomFieldValues => ({})))
  );

const transactionStatePriority = {
  Failure: 1,
  Pending: 0,
  Success: 2,
} as const;

const PAYMENT_RECONCILIATION_RETRIES = 1;

const transactionActions = (
  payment: Payment,
  input: RecordPaymentTransactionInput
): Effect.Effect<readonly PaymentUpdateAction[], PaymentProviderFailure> =>
  Effect.gen(function* () {
    const paymentMethodActions: PaymentUpdateAction[] = [];
    if (input.paymentMethod !== undefined) {
      if (payment.paymentMethodInfo.method !== "card") {
        return yield* paymentFailure(
          "payment.transaction.record",
          new Error("Card details belong to an incompatible Payment"),
          "invalidData"
        );
      }
      const cardFieldActions = yield* customFieldsBuilder
        .forType(PaymentCustomFields)
        .set("checkoutCardBrand", input.paymentMethod.cardBrand)
        .set("checkoutCardLastFour", input.paymentMethod.lastFour)
        .againstRest(payment.custom)
        .toRestUpdateActions()
        .pipe(
          Effect.mapError((cause) =>
            paymentFailure("payment.transaction.record", cause, "invalidData")
          )
        );
      paymentMethodActions.push(...cardFieldActions);
    }
    const existing = payment.transactions.find(
      (transaction) => transaction.interactionId === input.operationReference
    );
    if (existing === undefined) {
      return [
        {
          action: "addTransaction",
          transaction:
            input.providerReference === undefined
              ? {
                  amount: input.amount,
                  interactionId: input.operationReference,
                  state: input.state,
                  type: input.type,
                }
              : {
                  amount: input.amount,
                  interactionId: input.operationReference,
                  interfaceId: input.providerReference,
                  state: input.state,
                  type: input.type,
                },
        },
        ...paymentMethodActions,
      ];
    }
    if (
      existing.type !== input.type ||
      existing.amount.centAmount !== input.amount.centAmount ||
      existing.amount.currencyCode !== input.amount.currencyCode
    ) {
      return yield* paymentFailure(
        "payment.transaction.record",
        new Error(
          "Payment transaction identity was reused for another operation"
        ),
        "invalidData"
      );
    }

    const actions: PaymentUpdateAction[] = [];
    if (
      input.providerReference !== undefined &&
      existing.interfaceId !== input.providerReference
    ) {
      actions.push({
        action: "setTransactionInterfaceId",
        interfaceId: input.providerReference,
        transactionId: existing.id,
      });
    }
    const existingPriority = Option.getOrUndefined(
      Schema.decodeUnknownOption(PaymentTransactionState)(existing.state).pipe(
        Option.map((state) => transactionStatePriority[state])
      )
    );
    if (
      existing.state !== input.state &&
      (existingPriority === undefined ||
        transactionStatePriority[input.state] > existingPriority)
    ) {
      actions.push({
        action: "changeTransactionState",
        state: input.state,
        transactionId: existing.id,
      });
    }
    return [...actions, ...paymentMethodActions];
  });

const recordPaymentTransaction = (
  apiRoot: ByProjectKeyRequestBuilder,
  input: RecordPaymentTransactionInput,
  remainingRetries = PAYMENT_RECONCILIATION_RETRIES
): Effect.Effect<void, PaymentProviderFailure> =>
  findPaymentById(apiRoot, input.paymentReference).pipe(
    Effect.flatMap((payment) =>
      transactionActions(payment, input).pipe(
        Effect.flatMap((actions) =>
          actions.length === 0
            ? Effect.succeed(payment)
            : providerRequest("payment.transaction.record", async () => {
                const response = await apiRoot
                  .payments()
                  .withId({ ID: payment.id })
                  .post({
                    body: { actions: [...actions], version: payment.version },
                  })
                  .execute();
                return response.body;
              })
        )
      )
    ),
    Effect.catch((error) =>
      remainingRetries > 0 && isConcurrentModification(error.cause)
        ? recordPaymentTransaction(apiRoot, input, remainingRetries - 1)
        : Effect.fail(error)
    ),
    Effect.asVoid
  );

interface DesiredPayment {
  readonly checkout: PaymentCheckout;
  readonly customFields?: PaymentCustomFieldValues;
  readonly interfaceId?: string;
  readonly key: string;
  readonly method: "card" | "netTerms";
  readonly name: string;
  readonly paymentInterface: string;
  readonly token?: string;
}

const customFieldsFor = (desired: DesiredPayment): PaymentCustomFieldValues =>
  desired.customFields ?? {};

const paymentCustomFieldsBuilder = (desired: DesiredPayment) =>
  customFieldsBuilder
    .forType(PaymentCustomFields)
    .setAll(customFieldsFor(desired));

const customFieldsMatch = (payment: Payment, desired: DesiredPayment) =>
  paymentCustomFieldsBuilder(desired)
    .againstRest(payment.custom)
    .plan.pipe(
      Effect.map((plan) => plan._tag === "NoChange"),
      Effect.mapError((cause) =>
        paymentFailure("payment.read", cause, "invalidData")
      )
    );

const customFieldActions = (
  payment: Payment,
  desired: DesiredPayment
): Effect.Effect<readonly PaymentUpdateAction[], PaymentProviderFailure> =>
  paymentCustomFieldsBuilder(desired)
    .againstRest(payment.custom)
    .toRestUpdateActions()
    .pipe(
      Effect.map((actions): readonly PaymentUpdateAction[] => actions),
      Effect.mapError((cause) =>
        paymentFailure("payment.update", cause, "invalidData")
      )
    );

const paymentCustomFieldsDraft = (desired: DesiredPayment) =>
  paymentCustomFieldsBuilder(desired)
    .toRestDraft()
    .pipe(
      Effect.mapError((cause) =>
        paymentFailure("payment.create", cause, "invalidData")
      )
    );

const createPayment = (
  apiRoot: ByProjectKeyRequestBuilder,
  input: DesiredPayment
) =>
  Effect.gen(function* () {
    const custom = yield* paymentCustomFieldsDraft(input);
    const paymentMethodInfoWithoutToken: PaymentDraft["paymentMethodInfo"] = {
      method: input.method,
      name: { "en-US": input.name },
      paymentInterface: input.paymentInterface,
    };
    const paymentDraftWithoutInterfaceId: PaymentDraft = {
      amountPlanned: input.checkout.amount,
      key: input.key,
      paymentMethodInfo:
        input.token === undefined
          ? paymentMethodInfoWithoutToken
          : {
              ...paymentMethodInfoWithoutToken,
              token: { value: input.token },
            },
    };
    const paymentDraft: PaymentDraft =
      input.interfaceId === undefined
        ? paymentDraftWithoutInterfaceId
        : { ...paymentDraftWithoutInterfaceId, interfaceId: input.interfaceId };
    const body: PaymentDraft = {
      ...paymentDraft,
      custom,
    };
    return yield* providerRequest("payment.create", async () => {
      const response = await apiRoot
        .payments()
        .post({
          body,
          queryArgs: { expand: REST_CUSTOM_TYPE_EXPANSION },
        })
        .execute();
      return response.body;
    });
  });

const updatePayment = (
  apiRoot: ByProjectKeyRequestBuilder,
  payment: Payment,
  desired: DesiredPayment
): Effect.Effect<Payment, PaymentProviderFailure> => {
  if (
    (desired.interfaceId !== undefined &&
      payment.interfaceId !== undefined &&
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
  const tokenActions: PaymentUpdateAction[] =
    desired.token === undefined ||
    payment.paymentMethodInfo.token?.value === desired.token
      ? []
      : [
          {
            action: "setMethodInfoToken",
            token: { value: desired.token },
          },
        ];
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
        ...(desired.interfaceId === undefined ||
        payment.interfaceId === desired.interfaceId
          ? []
          : [
              {
                action: "setInterfaceId" as const,
                interfaceId: desired.interfaceId,
              },
            ]),
        ...methodInfoActions,
        ...tokenActions,
        ...customActions,
      ];
      if (actions.length === 0) {
        return Effect.succeed(payment);
      }

      return providerRequest("payment.update", async () => {
        const response = await apiRoot
          .payments()
          .withId({ ID: payment.id })
          .post({
            body: { actions, version: payment.version },
            queryArgs: { expand: REST_CUSTOM_TYPE_EXPANSION },
          })
          .execute();
        return response.body;
      });
    })
  );
};

const requireDesiredPayment = (
  payment: Payment,
  desired: DesiredPayment
): Effect.Effect<Payment, PaymentProviderFailure> => {
  const baseMatches =
    payment.amountPlanned.centAmount === desired.checkout.amount.centAmount &&
    payment.amountPlanned.currencyCode ===
      desired.checkout.amount.currencyCode &&
    (desired.interfaceId === undefined ||
      payment.interfaceId === desired.interfaceId) &&
    payment.paymentMethodInfo.method === desired.method &&
    payment.paymentMethodInfo.name?.["en-US"] === desired.name &&
    payment.paymentMethodInfo.paymentInterface === desired.paymentInterface &&
    (desired.token === undefined ||
      payment.paymentMethodInfo.token?.value === desired.token);
  const mismatch = () =>
    Effect.fail(
      paymentFailure(
        "payment.save",
        new Error("Saved Payment does not match the requested state"),
        "invalidData"
      )
    );
  if (!baseMatches) {
    return mismatch();
  }
  return customFieldsMatch(payment, desired).pipe(
    Effect.flatMap((matches) =>
      matches ? Effect.succeed(payment) : mismatch()
    )
  );
};

const isReconciliationConflict = (failure: PaymentProviderFailure) =>
  isConcurrentModification(failure.cause) ||
  hasCommercetoolsErrorCode(
    failure.cause,
    "DuplicateField",
    "DuplicateFieldWithConflictingResource"
  );

const paymentCanBeSuperseded = (payment: Payment) => {
  if (
    payment.transactions.some(
      (transaction) =>
        transaction.type === "Charge" && transaction.state === "Success"
    )
  ) {
    return false;
  }
  for (let index = payment.transactions.length - 1; index >= 0; index -= 1) {
    const transaction = payment.transactions[index];
    if (transaction !== undefined && transaction.state !== "Failure") {
      return (
        transaction.type === "CancelAuthorization" &&
        transaction.state === "Success"
      );
    }
  }
  return true;
};

const supersededPaymentKey = (payment: Payment, currentKey: string) => {
  const suffix = `-superseded-${payment.id}`;
  return `${currentKey.slice(0, 256 - suffix.length)}${suffix}`;
};

const supersedePayment = (
  apiRoot: ByProjectKeyRequestBuilder,
  payment: Payment,
  desired: DesiredPayment
): Effect.Effect<Payment, PaymentProviderFailure> => {
  if (!paymentCanBeSuperseded(payment)) {
    return Effect.fail(
      paymentFailure(
        "payment.update",
        new Error(
          "Payment provider identity cannot change after financial progress"
        ),
        "invalidData"
      )
    );
  }
  return providerRequest("payment.supersede", async () => {
    await apiRoot
      .payments()
      .withId({ ID: payment.id })
      .post({
        body: {
          actions: [
            {
              action: "setKey",
              key: supersededPaymentKey(payment, desired.key),
            },
          ],
          version: payment.version,
        },
      })
      .execute();
  }).pipe(Effect.flatMap(() => createPayment(apiRoot, desired)));
};

const reconcilePayment = (
  apiRoot: ByProjectKeyRequestBuilder,
  payment: Payment,
  desired: DesiredPayment
) => {
  if (
    payment.paymentMethodInfo.paymentInterface !== undefined &&
    payment.paymentMethodInfo.paymentInterface !== desired.paymentInterface
  ) {
    return Effect.fail(
      paymentFailure(
        "payment.update",
        new Error("Payment belongs to another provider identity"),
        "invalidData"
      )
    );
  }
  return desired.interfaceId !== undefined &&
    payment.interfaceId !== undefined &&
    payment.interfaceId !== desired.interfaceId
    ? supersedePayment(apiRoot, payment, desired)
    : updatePayment(apiRoot, payment, desired);
};

const ensurePayment = (
  apiRoot: ByProjectKeyRequestBuilder,
  desired: DesiredPayment,
  remainingRetries = PAYMENT_RECONCILIATION_RETRIES
): Effect.Effect<Payment, PaymentProviderFailure> =>
  findPaymentByKey(apiRoot, desired.key).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => createPayment(apiRoot, desired),
        onSome: (payment) => reconcilePayment(apiRoot, payment, desired),
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
): Effect.Effect<CardPaymentRecord, PaymentProviderFailure> =>
  Effect.gen(function* () {
    const provider = payment.paymentMethodInfo.paymentInterface;
    const confirmationReferenceValue = payment.paymentMethodInfo.token?.value;
    const fields = yield* paymentCustomFieldsOrEmpty(payment, "payment.read");
    const attemptReference = Schema.decodeUnknownOption(
      PaymentAttemptReference
    )(fields.checkoutPlacementAttemptReference);
    const confirmationReference =
      confirmationReferenceValue === undefined
        ? Option.none()
        : Schema.decodeOption(PaymentConfirmationReference)(
            confirmationReferenceValue
          );
    const cardBrandValue = fields.checkoutCardBrand;
    const cardLastFourValue = fields.checkoutCardLastFour;
    const cardBrand = Schema.decodeUnknownOption(CardBrand)(cardBrandValue);
    const cardLastFour =
      Schema.decodeUnknownOption(CardLastFour)(cardLastFourValue);
    const providerReference = Schema.decodeUnknownOption(
      PaymentProviderReference
    )(payment.interfaceId);
    if (Option.isNone(providerReference) || provider === undefined) {
      return yield* paymentFailure(
        "payment.read",
        new Error("Card Payment has no provider identity"),
        "invalidData"
      );
    }
    if (
      confirmationReferenceValue !== undefined &&
      Option.isNone(confirmationReference)
    ) {
      return yield* paymentFailure(
        "payment.read",
        new Error("Card Payment has an invalid confirmation reference"),
        "invalidData"
      );
    }
    if (
      (cardBrandValue === undefined) !== (cardLastFourValue === undefined) ||
      (cardBrandValue !== undefined &&
        (Option.isNone(cardBrand) || Option.isNone(cardLastFour)))
    ) {
      return yield* paymentFailure(
        "payment.read",
        new Error("Card Payment has invalid display details"),
        "invalidData"
      );
    }
    const common = {
      method: "card" as const,
      paymentReference: PaymentReference.make(payment.id),
      provider: PaymentProvider.make(provider),
      providerReference: providerReference.value,
    };
    const withAttempt = Option.isNone(attemptReference)
      ? common
      : { ...common, attemptReference: attemptReference.value };
    const withConfirmation = Option.isNone(confirmationReference)
      ? withAttempt
      : {
          ...withAttempt,
          confirmationReference: confirmationReference.value,
        };
    return Option.isNone(cardBrand) || Option.isNone(cardLastFour)
      ? withConfirmation
      : {
          ...withConfirmation,
          paymentMethod: {
            cardBrand: cardBrand.value,
            lastFour: cardLastFour.value,
            method: "card" as const,
          },
        };
  });

const requireNetTermsPaymentRecord = (
  payment: Payment
): Effect.Effect<NetTermsPaymentRecord, PaymentProviderFailure> =>
  Effect.gen(function* () {
    const provider = payment.paymentMethodInfo.paymentInterface;
    const fields = yield* paymentCustomFieldsOrEmpty(payment, "payment.read");
    const providerReference = Schema.decodeUnknownOption(
      PaymentProviderReference
    )(payment.interfaceId);
    const termsInDays = Schema.decodeUnknownOption(
      Schema.Int.check(Schema.isGreaterThan(0))
    )(fields.checkoutTermsInDays);
    const attemptReference = Schema.decodeUnknownOption(
      PaymentAttemptReference
    )(fields.checkoutPlacementAttemptReference);
    if (
      provider === undefined ||
      Option.isNone(providerReference) ||
      Option.isNone(termsInDays)
    ) {
      return yield* paymentFailure(
        "payment.read",
        new Error("Net Terms Payment has invalid provider metadata"),
        "invalidData"
      );
    }
    const common = {
      method: "netTerms",
      paymentReference: PaymentReference.make(payment.id),
      provider: PaymentProvider.make(provider),
      providerReference: providerReference.value,
      termsInDays: termsInDays.value,
    } as const;
    return Option.isNone(attemptReference)
      ? common
      : { ...common, attemptReference: attemptReference.value };
  });

const requirePaymentRecord = (
  payment: Payment
): Effect.Effect<PaymentRecord, PaymentProviderFailure> => {
  if (payment.paymentMethodInfo.method === "card") {
    return requireCardPaymentRecord(payment);
  }
  if (payment.paymentMethodInfo.method === "netTerms") {
    return requireNetTermsPaymentRecord(payment);
  }
  return Effect.fail(
    paymentFailure(
      "payment.read",
      new Error("Payment has an unsupported checkout method"),
      "invalidData"
    )
  );
};

export const paymentRepositoryLayerFrom = (
  apiRoot: ByProjectKeyRequestBuilder
) =>
  Layer.succeed(
    PaymentRepository,
    PaymentRepository.of({
      findByReference: Effect.fn(
        "CommercetoolsPaymentRepository.findByReference"
      )((paymentReference) =>
        findPaymentById(apiRoot, paymentReference).pipe(
          Effect.flatMap(requirePaymentRecord),
          Effect.map((record) => Option.some<PaymentRecord>(record)),
          Effect.catch((error) =>
            isNotFound(error)
              ? Effect.succeed(Option.none<PaymentRecord>())
              : Effect.fail(error)
          )
        )
      ),
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
      findTransactions: Effect.fn(
        "CommercetoolsPaymentRepository.findTransactions"
      )((paymentReference) =>
        findPaymentById(apiRoot, paymentReference).pipe(
          Effect.flatMap(paymentTransactions)
        )
      ),
      recordTransaction: Effect.fn(
        "CommercetoolsPaymentRepository.recordTransaction"
      )((input) => recordPaymentTransaction(apiRoot, input)),
      saveCard: Effect.fn("CommercetoolsPaymentRepository.saveCard")(
        (input) => {
          const key = cardPaymentKeyForCheckout(input.checkout.reference);
          const base: DesiredPayment = {
            checkout: input.checkout,
            interfaceId: input.providerReference,
            key,
            method: "card",
            name: "Card",
            paymentInterface: input.provider,
          };
          const desired: DesiredPayment =
            input.attemptReference === undefined
              ? base
              : {
                  ...base,
                  customFields: {
                    ...customFieldsFor(base),
                    checkoutPlacementAttemptReference: input.attemptReference,
                  },
                };
          const selectedCustomFields = {
            ...customFieldsFor(desired),
          };
          const selected: DesiredPayment = {
            ...desired,
            customFields: selectedCustomFields,
            token: input.confirmationReference,
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
              checkoutPlacementAttemptReference: input.attemptReference,
              checkoutTermsInDays: input.termsInDays,
            },
            interfaceId: input.providerReference,
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
