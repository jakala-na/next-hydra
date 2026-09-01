import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import type { CheckoutPaymentBuyer } from "../domain";
import {
  PaymentAccountReference,
  PaymentCheckoutReference,
  PaymentReference,
} from "../domain";
import { AccountCredit } from "./account-credit";
import type { CreditProfile } from "./account-credit";
import { NetTermsPaymentMethod } from "./net-terms-payment-method";
import { PaymentRepository } from "./payment-repository";

const accountReference = PaymentAccountReference.make("account-under-test");
const checkout = {
  amount: { centAmount: 1_700_000, currencyCode: "USD" },
  reference: PaymentCheckoutReference.make("checkout-under-test"),
};
const provider = "Account Credit Provider";

const layerFor = (profiles: readonly CreditProfile[]) =>
  NetTermsPaymentMethod.layer.pipe(
    Layer.provide(
      Layer.merge(
        AccountCredit.layerMemory(
          new Map(profiles.map((profile) => [accountReference, profile])),
          provider
        ),
        PaymentRepository.layerMemory({
          cardPaymentReferenceFor: () =>
            PaymentReference.make("unused-card-payment"),
          netTermsPaymentReferenceFor: () =>
            PaymentReference.make("net-terms-payment"),
        })
      )
    )
  );

const assess = (buyer: CheckoutPaymentBuyer) =>
  Effect.gen(function* () {
    const method = yield* NetTermsPaymentMethod;
    return yield* method.eligibility({ buyer, checkout });
  });

describe(NetTermsPaymentMethod, () => {
  it.effect("does not offer Net Terms to a guest", () =>
    Effect.gen(function* () {
      const result = yield* assess({ type: "guest" });

      expect(result).toStrictEqual({
        _tag: "Ineligible",
        reason: "notApplicable",
      });
    }).pipe(Effect.provide(layerFor([])))
  );

  it.effect("does not offer Net Terms to an unapproved Business Unit", () =>
    Effect.gen(function* () {
      const result = yield* assess({
        accountReference,
        type: "company",
      });

      expect(result).toStrictEqual({
        _tag: "Ineligible",
        reason: "notApproved",
      });
    }).pipe(Effect.provide(layerFor([])))
  );

  it.effect("offers Net Terms with full funding capacity", () =>
    Effect.gen(function* () {
      const result = yield* assess({
        accountReference,
        type: "company",
      });

      expect(result).toMatchObject({
        _tag: "Eligible",
        funding: {
          _tag: "Full",
          fundableAmount: checkout.amount,
        },
      });
    }).pipe(
      Effect.provide(
        layerFor([
          {
            availableCredit: {
              centAmount: 2_000_000,
              currencyCode: "USD",
            },
            termsInDays: 30,
          },
        ])
      )
    )
  );

  it.effect("offers Net Terms with partial funding capacity", () =>
    Effect.gen(function* () {
      const result = yield* assess({
        accountReference,
        type: "company",
      });

      expect(result).toMatchObject({
        _tag: "Eligible",
        funding: {
          _tag: "Partial",
          fundableAmount: {
            centAmount: 1_600_000,
            currencyCode: "USD",
          },
          shortfall: { centAmount: 100_000, currencyCode: "USD" },
        },
      });
    }).pipe(
      Effect.provide(
        layerFor([
          {
            availableCredit: {
              centAmount: 1_600_000,
              currencyCode: "USD",
            },
            termsInDays: 30,
          },
        ])
      )
    )
  );

  it.effect("offers Net Terms with no funding capacity", () =>
    Effect.gen(function* () {
      const result = yield* assess({
        accountReference,
        type: "company",
      });

      expect(result).toMatchObject({
        _tag: "Eligible",
        funding: {
          _tag: "None",
          fundableAmount: { centAmount: 0, currencyCode: "USD" },
          shortfall: checkout.amount,
        },
      });
    }).pipe(
      Effect.provide(
        layerFor([
          {
            availableCredit: { centAmount: 0, currencyCode: "USD" },
            termsInDays: 30,
          },
        ])
      )
    )
  );
});
