/* oxlint-disable typescript/promise-function-async -- The provider contract doubles return already-settled Promises. */
import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import {
  PaymentCheckoutReference,
  PaymentConfirmationReference,
  PaymentProvider,
  PaymentProviderReference,
  PaymentRepository,
} from "@repo/payments";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";

import { paymentRepositoryLayerFrom } from "./payment-repository";

interface StoredPayment {
  readonly amountPlanned: {
    readonly centAmount: number;
    readonly currencyCode: string;
  };
  readonly custom?: {
    readonly fields: Readonly<Record<string, number | string>>;
  };
  readonly id: string;
  readonly interfaceId?: string;
  readonly paymentMethodInfo: {
    readonly method?: string;
    readonly name?: Readonly<Record<string, string>>;
    readonly paymentInterface?: string;
  };
  readonly transactions: readonly {
    readonly state: string;
  }[];
  readonly version: number;
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
    });
  });

  it("returns the provider identity with a Card Payment reference", async () => {
    const payment: StoredPayment = {
      amountPlanned: checkout.amount,
      custom: {
        fields: { checkoutConfirmationReference: "ctoken-from-provider" },
      },
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
              custom: {
                fields: {
                  checkoutConfirmationReference: confirmationReference,
                },
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
            action: "setCustomType",
            fields: {
              checkoutConfirmationReference: confirmationReference,
            },
            type: { key: "checkoutPaymentFields", typeId: "type" },
          },
        ],
        version: 1,
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
      interfaceId: "checkout-net-terms-cart-from-input",
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
          checkout,
          provider: PaymentProvider.make("erp-credit"),
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
      interfaceId: "checkout-net-terms-cart-from-input",
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
            checkout,
            provider: PaymentProvider.make("erp-credit"),
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
});
