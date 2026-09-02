/* oxlint-disable typescript/promise-function-async -- The provider contract doubles return already-settled Promises. */
import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import {
  CardBrand,
  CardLastFour,
  PaymentAttemptReference,
  PaymentCheckoutReference,
  PaymentConfirmationReference,
  PaymentOperationReference,
  PaymentProvider,
  PaymentProviderReference,
  PaymentProviderTransactionReference,
  PaymentRepository,
  PaymentReference,
} from "@repo/payments";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";

import { paymentRepositoryLayerFrom } from "./payment-repository";

const attemptReference = PaymentAttemptReference.make("attempt-from-input");

interface StoredPayment {
  readonly amountPlanned: {
    readonly centAmount: number;
    readonly currencyCode: string;
  };
  readonly custom?: {
    readonly fields: Readonly<Record<string, number | string>>;
    readonly type?: { readonly key: string };
  };
  readonly id: string;
  readonly interfaceId?: string;
  readonly paymentMethodInfo: {
    readonly method?: string;
    readonly name?: Readonly<Record<string, string>>;
    readonly paymentInterface?: string;
    readonly token?: { readonly value: string };
  };
  readonly transactions: readonly {
    readonly amount?: {
      readonly centAmount: number;
      readonly currencyCode: string;
    };
    readonly id?: string;
    readonly interactionId?: string;
    readonly interfaceId?: string;
    readonly state: string;
    readonly type?: string;
  }[];
  readonly version: number;
}

type StoredTransaction = StoredPayment["transactions"][number];

type TestPaymentUpdateAction =
  | {
      readonly action: "addTransaction";
      readonly transaction: StoredTransaction;
    }
  | {
      readonly action: "changeTransactionState";
      readonly state: string;
    };

interface TestPaymentUpdateBody {
  readonly actions: readonly [TestPaymentUpdateAction];
}

const checkout = {
  amount: { centAmount: 1_700_000, currencyCode: "USD" },
  reference: PaymentCheckoutReference.make("cart-from-input"),
};

const notFound = () =>
  Promise.reject(Object.assign(new Error("Not found"), { statusCode: 404 }));

describe("Commercetools PaymentRepository", () => {
  it("creates a typed Card Payment before a ConfirmationToken is available", async () => {
    let created: unknown;
    const payment: StoredPayment = {
      amountPlanned: checkout.amount,
      custom: { fields: {} },
      id: "card-payment-from-provider",
      interfaceId: "pi-from-input",
      paymentMethodInfo: {
        method: "card",
        name: { "en-US": "Card" },
        paymentInterface: "Stripe",
      },
      transactions: [],
      version: 1,
    };
    const payments = () => ({
      post: ({ body }: { readonly body: unknown }) => ({
        execute: () => {
          created = body;
          return Promise.resolve({ body: payment });
        },
      }),
      withKey: () => ({ get: () => ({ execute: notFound }) }),
    });
    // SAFETY: The adapter consumes only the Payments request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = { payments } as unknown as ByProjectKeyRequestBuilder;

    const paymentReference = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* PaymentRepository;
        return yield* repository.saveCard({
          checkout,
          provider: PaymentProvider.make("Stripe"),
          providerReference: PaymentProviderReference.make("pi-from-input"),
        });
      }).pipe(Effect.provide(paymentRepositoryLayerFrom(apiRoot)))
    );

    expect(paymentReference).toBe("card-payment-from-provider");
    expect(created).toMatchObject({
      custom: {
        fields: {},
        type: { key: "checkoutPaymentFields", typeId: "type" },
      },
      interfaceId: "pi-from-input",
    });
  });

  it("returns the provider identity with a Card Payment reference", async () => {
    const payment: StoredPayment = {
      amountPlanned: checkout.amount,
      custom: {
        fields: {
          checkoutCardBrand: "visa",
          checkoutCardLastFour: "4242",
        },
      },
      id: "card-payment-from-provider",
      interfaceId: "pi-from-provider",
      paymentMethodInfo: {
        method: "card",
        name: { "en-US": "Card" },
        paymentInterface: "Stripe",
        token: { value: "ctoken-from-provider" },
      },
      transactions: [],
      version: 1,
    };
    const payments = () => ({
      withKey: () => ({
        get: () => ({ execute: () => Promise.resolve({ body: payment }) }),
      }),
    });
    // SAFETY: The adapter consumes only the Payments request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = { payments } as unknown as ByProjectKeyRequestBuilder;

    const record = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* PaymentRepository;
        return Option.getOrThrow(
          yield* repository.findCard(checkout.reference)
        );
      }).pipe(Effect.provide(paymentRepositoryLayerFrom(apiRoot)))
    );

    expect(record).toStrictEqual({
      confirmationReference: "ctoken-from-provider",
      method: "card",
      paymentMethod: {
        cardBrand: "visa",
        lastFour: "4242",
        method: "card",
      },
      paymentReference: "card-payment-from-provider",
      provider: PaymentProvider.make("Stripe"),
      providerReference: "pi-from-provider",
    });
  });

  it("persists the selected Card confirmation on its Payment", async () => {
    const confirmationReference =
      PaymentConfirmationReference.make("ctoken-from-input");
    let current: StoredPayment = {
      amountPlanned: checkout.amount,
      custom: { fields: {} },
      id: "card-payment-from-provider",
      interfaceId: "pi-from-provider",
      paymentMethodInfo: {
        method: "card",
        name: { "en-US": "Card" },
        paymentInterface: "Stripe",
      },
      transactions: [],
      version: 1,
    };
    const updateBodies: unknown[] = [];
    const payments = () => ({
      post: () => ({ execute: notFound }),
      withId: () => ({
        post: ({ body }: { readonly body: unknown }) => ({
          execute: () => {
            updateBodies.push(body);
            current = {
              ...current,
              paymentMethodInfo: {
                ...current.paymentMethodInfo,
                token: { value: confirmationReference },
              },
              version: 2,
            };
            return Promise.resolve({ body: current });
          },
        }),
      }),
      withKey: () => ({
        get: () => ({ execute: () => Promise.resolve({ body: current }) }),
      }),
    });
    // SAFETY: The adapter consumes only the Payments request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = { payments } as unknown as ByProjectKeyRequestBuilder;

    const paymentReference = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* PaymentRepository;
        return yield* repository.saveCard({
          checkout,
          confirmationReference,
          provider: PaymentProvider.make("Stripe"),
          providerReference: PaymentProviderReference.make("pi-from-provider"),
        });
      }).pipe(Effect.provide(paymentRepositoryLayerFrom(apiRoot)))
    );

    expect(paymentReference).toBe("card-payment-from-provider");
    expect(updateBodies).toStrictEqual([
      {
        actions: [
          {
            action: "setMethodInfoToken",
            token: { value: confirmationReference },
          },
        ],
        version: 1,
      },
    ]);
  });

  it("retains a released Card Payment and creates a new Payment for a new provider reference", async () => {
    const released: StoredPayment = {
      amountPlanned: checkout.amount,
      custom: { fields: {} },
      id: "card-payment-from-provider",
      interfaceId: "pi-released-from-provider",
      paymentMethodInfo: {
        method: "card",
        name: { "en-US": "Card" },
        paymentInterface: "Stripe",
      },
      transactions: [
        {
          id: "cancel-transaction-from-provider",
          state: "Success",
          type: "CancelAuthorization",
        },
      ],
      version: 2,
    };
    const createdBodies: unknown[] = [];
    const updateBodies: unknown[] = [];
    const replacement: StoredPayment = {
      ...released,
      id: "replacement-payment-from-provider",
      interfaceId: "pi-new-from-input",
      transactions: [],
      version: 1,
    };
    const payments = () => ({
      post: ({ body }: { readonly body: unknown }) => ({
        execute: () => {
          createdBodies.push(body);
          return Promise.resolve({ body: replacement });
        },
      }),
      withId: () => ({
        post: ({ body }: { readonly body: unknown }) => ({
          execute: () => {
            updateBodies.push(body);
            return Promise.resolve({ body: { ...released, version: 3 } });
          },
        }),
      }),
      withKey: () => ({
        get: () => ({ execute: () => Promise.resolve({ body: released }) }),
      }),
    });
    // SAFETY: The adapter consumes only the Payments request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = { payments } as unknown as ByProjectKeyRequestBuilder;

    const paymentReference = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* PaymentRepository;
        return yield* repository.saveCard({
          checkout,
          provider: PaymentProvider.make("Stripe"),
          providerReference: PaymentProviderReference.make("pi-new-from-input"),
        });
      }).pipe(Effect.provide(paymentRepositoryLayerFrom(apiRoot)))
    );

    expect(paymentReference).toBe("replacement-payment-from-provider");
    expect(updateBodies).toStrictEqual([
      {
        actions: [
          {
            action: "setKey",
            key: "checkout-card-cart-from-input-superseded-card-payment-from-provider",
          },
        ],
        version: 2,
      },
    ]);
    expect(createdBodies).toMatchObject([
      {
        interfaceId: "pi-new-from-input",
        key: "checkout-card-cart-from-input",
        paymentMethodInfo: { paymentInterface: "Stripe" },
      },
    ]);
  });

  it("re-reads a Payment created by a concurrent preparation", async () => {
    const winner: StoredPayment = {
      amountPlanned: checkout.amount,
      custom: { fields: {} },
      id: "payment-from-concurrent-request",
      interfaceId: "pi-from-input",
      paymentMethodInfo: {
        method: "card",
        name: { "en-US": "Card" },
        paymentInterface: "Stripe",
      },
      transactions: [],
      version: 1,
    };
    let reads = 0;
    let creates = 0;
    const payments = () => ({
      post: () => ({
        execute: () => {
          creates += 1;
          return Promise.reject(
            Object.assign(new Error("Duplicate key"), {
              body: { errors: [{ code: "DuplicateField" }] },
              statusCode: 400,
            })
          );
        },
      }),
      withId: () => ({
        post: () => ({ execute: () => Promise.resolve({ body: winner }) }),
      }),
      withKey: () => ({
        get: () => ({
          execute: () => {
            reads += 1;
            return reads === 1 ? notFound() : Promise.resolve({ body: winner });
          },
        }),
      }),
    });
    // SAFETY: The adapter consumes only the Payments request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = { payments } as unknown as ByProjectKeyRequestBuilder;

    const paymentReference = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* PaymentRepository;
        return yield* repository.saveCard({
          checkout,
          provider: PaymentProvider.make("Stripe"),
          providerReference: PaymentProviderReference.make("pi-from-input"),
        });
      }).pipe(Effect.provide(paymentRepositoryLayerFrom(apiRoot)))
    );

    expect({ creates, paymentReference, reads }).toStrictEqual({
      creates: 1,
      paymentReference: "payment-from-concurrent-request",
      reads: 2,
    });
  });

  it("reconciles Net Terms metadata after a version conflict", async () => {
    let current: StoredPayment = {
      amountPlanned: checkout.amount,
      id: "net-terms-payment",
      interfaceId: "credit-payment-from-provider",
      paymentMethodInfo: {
        method: "netTerms",
        name: { "en-US": "Net 15" },
        paymentInterface: "erp-credit",
      },
      transactions: [],
      version: 1,
    };
    const updateBodies: unknown[] = [];
    const payments = () => ({
      post: () => ({ execute: notFound }),
      withId: () => ({
        post: ({ body }: { readonly body: unknown }) => ({
          execute: () => {
            updateBodies.push(body);
            if (updateBodies.length === 1) {
              current = { ...current, version: 2 };
              return Promise.reject(
                Object.assign(new Error("Concurrent modification"), {
                  body: {
                    errors: [
                      { code: "ConcurrentModification", currentVersion: 2 },
                    ],
                  },
                  statusCode: 409,
                })
              );
            }
            current = {
              ...current,
              custom: {
                fields: {
                  checkoutPlacementAttemptReference: attemptReference,
                  checkoutTermsInDays: 30,
                },
              },
              paymentMethodInfo: {
                ...current.paymentMethodInfo,
                name: { "en-US": "Net 30" },
              },
              version: 3,
            };
            return Promise.resolve({ body: current });
          },
        }),
      }),
      withKey: () => ({
        get: () => ({ execute: () => Promise.resolve({ body: current }) }),
      }),
    });
    // SAFETY: The adapter consumes only the Payments request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = { payments } as unknown as ByProjectKeyRequestBuilder;

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* PaymentRepository;
        yield* repository.saveNetTerms({
          attemptReference,
          checkout,
          provider: PaymentProvider.make("erp-credit"),
          providerReference: PaymentProviderReference.make(
            "credit-payment-from-provider"
          ),
          termsInDays: 30,
        });
      }).pipe(Effect.provide(paymentRepositoryLayerFrom(apiRoot)))
    );

    expect(updateBodies).toHaveLength(2);
    expect(updateBodies[1]).toMatchObject({
      actions: [
        {
          action: "setMethodInfo",
          method: "netTerms",
          name: { "en-US": "Net 30" },
        },
        {
          action: "setCustomType",
          fields: {
            checkoutPlacementAttemptReference: attemptReference,
            checkoutTermsInDays: 30,
          },
          type: { key: "checkoutPaymentFields", typeId: "type" },
        },
      ],
      version: 2,
    });
  });

  it("stops reconciliation after one version-conflict retry", async () => {
    let current: StoredPayment = {
      amountPlanned: checkout.amount,
      id: "net-terms-payment",
      interfaceId: "credit-payment-from-provider",
      paymentMethodInfo: {
        method: "netTerms",
        name: { "en-US": "Net 15" },
        paymentInterface: "erp-credit",
      },
      transactions: [],
      version: 1,
    };
    let updates = 0;
    const payments = () => ({
      post: () => ({ execute: notFound }),
      withId: () => ({
        post: () => ({
          execute: () => {
            updates += 1;
            current = { ...current, version: current.version + 1 };
            return Promise.reject(
              Object.assign(new Error("Concurrent modification"), {
                body: {
                  errors: [
                    {
                      code: "ConcurrentModification",
                      currentVersion: current.version,
                    },
                  ],
                },
                statusCode: 409,
              })
            );
          },
        }),
      }),
      withKey: () => ({
        get: () => ({ execute: () => Promise.resolve({ body: current }) }),
      }),
    });
    // SAFETY: The adapter consumes only the Payments request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = { payments } as unknown as ByProjectKeyRequestBuilder;

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* PaymentRepository;
        return yield* repository
          .saveNetTerms({
            attemptReference,
            checkout,
            provider: PaymentProvider.make("erp-credit"),
            providerReference: PaymentProviderReference.make(
              "credit-payment-from-provider"
            ),
            termsInDays: 30,
          })
          .pipe(Effect.flip);
      }).pipe(Effect.provide(paymentRepositoryLayerFrom(apiRoot)))
    );

    expect(failure).toMatchObject({
      _tag: "PaymentProviderFailure",
      operation: "payment.update",
    });
    expect(updates).toBe(2);
  });

  it("rejects amount changes after a Payment has financial progress", async () => {
    const authorized: StoredPayment = {
      amountPlanned: { centAmount: 1_600_000, currencyCode: "USD" },
      id: "authorized-payment",
      interfaceId: "pi-from-input",
      paymentMethodInfo: {
        method: "card",
        name: { "en-US": "Card" },
        paymentInterface: "Stripe",
      },
      transactions: [{ state: "Success" }],
      version: 2,
    };
    let updates = 0;
    const payments = () => ({
      post: () => ({ execute: notFound }),
      withId: () => ({
        post: () => ({
          execute: () => {
            updates += 1;
            return Promise.resolve({ body: authorized });
          },
        }),
      }),
      withKey: () => ({
        get: () => ({ execute: () => Promise.resolve({ body: authorized }) }),
      }),
    });
    // SAFETY: The adapter consumes only the Payments request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = { payments } as unknown as ByProjectKeyRequestBuilder;

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* PaymentRepository;
        return yield* repository
          .saveCard({
            checkout,
            provider: PaymentProvider.make("Stripe"),
            providerReference: PaymentProviderReference.make("pi-from-input"),
          })
          .pipe(Effect.flip);
      }).pipe(Effect.provide(paymentRepositoryLayerFrom(apiRoot)))
    );

    expect(failure).toMatchObject({
      _tag: "PaymentProviderFailure",
      operation: "payment.update",
      reason: "invalidData",
    });
    expect(updates).toBe(0);
  });

  it("rejects an existing Payment with another provider identity", async () => {
    const mismatched: StoredPayment = {
      amountPlanned: checkout.amount,
      id: "mismatched-payment",
      interfaceId: "another-payment-intent",
      paymentMethodInfo: {
        method: "card",
        name: { "en-US": "Card" },
        paymentInterface: "AnotherProvider",
      },
      transactions: [],
      version: 1,
    };
    const payments = () => ({
      post: () => ({ execute: notFound }),
      withId: () => ({
        post: () => ({ execute: () => Promise.resolve({ body: mismatched }) }),
      }),
      withKey: () => ({
        get: () => ({ execute: () => Promise.resolve({ body: mismatched }) }),
      }),
    });
    // SAFETY: The adapter consumes only the Payments request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = { payments } as unknown as ByProjectKeyRequestBuilder;

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* PaymentRepository;
        return yield* repository
          .saveCard({
            checkout,
            provider: PaymentProvider.make("Stripe"),
            providerReference: PaymentProviderReference.make("pi-from-input"),
          })
          .pipe(Effect.flip);
      }).pipe(Effect.provide(paymentRepositoryLayerFrom(apiRoot)))
    );

    expect(failure).toMatchObject({
      _tag: "PaymentProviderFailure",
      reason: "invalidData",
    });
  });

  it("adds then completes one native Payment transaction by operation reference", async () => {
    let current: StoredPayment = {
      amountPlanned: checkout.amount,
      id: "card-payment-from-provider",
      interfaceId: "pi-from-provider",
      paymentMethodInfo: {
        method: "card",
        name: { "en-US": "Card" },
        paymentInterface: "Stripe",
      },
      transactions: [],
      version: 1,
    };
    const updateBodies: TestPaymentUpdateBody[] = [];
    const payments = () => ({
      withId: () => ({
        get: () => ({ execute: () => Promise.resolve({ body: current }) }),
        post: ({ body }: { readonly body: TestPaymentUpdateBody }) => ({
          execute: () => {
            updateBodies.push(body);
            const [action] = body.actions;
            current =
              action.action === "addTransaction"
                ? {
                    ...current,
                    transactions: [
                      {
                        ...action.transaction,
                        id: "transaction-from-provider",
                      },
                    ],
                    version: current.version + 1,
                  }
                : {
                    ...current,
                    transactions: current.transactions.map((transaction) => ({
                      ...transaction,
                      state: action.state,
                    })),
                    version: current.version + 1,
                  };
            return Promise.resolve({ body: current });
          },
        }),
      }),
    });
    // SAFETY: The adapter consumes only the Payments request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = { payments } as unknown as ByProjectKeyRequestBuilder;
    const operationReference = PaymentOperationReference.make(
      "placement-from-input:authorize"
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* PaymentRepository;
        const common = {
          amount: checkout.amount,
          operationReference,
          paymentReference: PaymentReference.make(current.id),
          providerReference:
            PaymentProviderTransactionReference.make("ch-from-provider"),
          type: "Authorization" as const,
        };
        yield* repository.recordTransaction({ ...common, state: "Pending" });
        yield* repository.recordTransaction({ ...common, state: "Success" });
        yield* repository.recordTransaction({ ...common, state: "Success" });
      }).pipe(Effect.provide(paymentRepositoryLayerFrom(apiRoot)))
    );

    expect(updateBodies).toStrictEqual([
      {
        actions: [
          {
            action: "addTransaction",
            transaction: {
              amount: checkout.amount,
              interactionId: operationReference,
              interfaceId: "ch-from-provider",
              state: "Pending",
              type: "Authorization",
            },
          },
        ],
        version: 1,
      },
      {
        actions: [
          {
            action: "changeTransactionState",
            state: "Success",
            transactionId: "transaction-from-provider",
          },
        ],
        version: 2,
      },
    ]);
  });

  it("persists Card display details with successful authorization", async () => {
    const operationReference = PaymentOperationReference.make(
      "placement-from-input:authorize"
    );
    const current: StoredPayment = {
      amountPlanned: checkout.amount,
      custom: {
        fields: {},
        type: { key: "checkoutPaymentFields" },
      },
      id: "card-payment-from-provider",
      interfaceId: "pi-from-provider",
      paymentMethodInfo: {
        method: "card",
        name: { "en-US": "Card" },
        paymentInterface: "Stripe",
      },
      transactions: [
        {
          amount: checkout.amount,
          id: "authorization-from-provider",
          interactionId: operationReference,
          state: "Pending",
          type: "Authorization",
        },
      ],
      version: 2,
    };
    const updateBodies: unknown[] = [];
    const payments = () => ({
      withId: () => ({
        get: () => ({ execute: () => Promise.resolve({ body: current }) }),
        post: ({ body }: { readonly body: unknown }) => ({
          execute: () => {
            updateBodies.push(body);
            return Promise.resolve({ body: current });
          },
        }),
      }),
    });
    // SAFETY: The adapter consumes only the Payments request-builder methods
    // implemented by this contract double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
    const apiRoot = { payments } as unknown as ByProjectKeyRequestBuilder;

    await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* PaymentRepository;
        yield* repository.recordTransaction({
          amount: checkout.amount,
          operationReference,
          paymentMethod: {
            cardBrand: CardBrand.make("visa"),
            lastFour: CardLastFour.make("4242"),
            method: "card",
          },
          paymentReference: PaymentReference.make(current.id),
          providerReference:
            PaymentProviderTransactionReference.make("ch-from-provider"),
          state: "Success",
          type: "Authorization",
        });
      }).pipe(Effect.provide(paymentRepositoryLayerFrom(apiRoot)))
    );

    expect(updateBodies).toStrictEqual([
      {
        actions: [
          {
            action: "setTransactionInterfaceId",
            interfaceId: "ch-from-provider",
            transactionId: "authorization-from-provider",
          },
          {
            action: "changeTransactionState",
            state: "Success",
            transactionId: "authorization-from-provider",
          },
          {
            action: "setCustomField",
            name: "checkoutCardBrand",
            value: "visa",
          },
          {
            action: "setCustomField",
            name: "checkoutCardLastFour",
            value: "4242",
          },
        ],
        version: 2,
      },
    ]);
  });
});
