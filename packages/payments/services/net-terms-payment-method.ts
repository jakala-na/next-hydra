import { Context, Effect, Layer, Option } from "effect";

import { PaymentMethodUnavailable } from "../domain";
import type {
  CheckoutPaymentBuyer,
  NetTermsPaymentOption,
  PaymentAttemptReference,
  PaymentBillingAddress,
  PaymentCheckout,
  PaymentProvider,
  PaymentProviderFailure,
  PreparedNetTermsPayment,
} from "../domain";
import { AccountCredit } from "./account-credit";
import type { AccountCreditProfile } from "./account-credit";
import type {
  PaymentMethodEligibility,
  PaymentMethodFunding,
} from "./payment-method";
import { PaymentRepository } from "./payment-repository";

export interface NetTermsPaymentMethodInput {
  readonly buyer: CheckoutPaymentBuyer;
  readonly checkout: PaymentCheckout;
}

interface NetTermsPaymentMethodOffer {
  readonly funding: PaymentMethodFunding;
  readonly option: NetTermsPaymentOption;
  readonly provider: PaymentProvider;
}

export type NetTermsPaymentMethodEligibility =
  PaymentMethodEligibility<NetTermsPaymentMethodOffer>;

export interface SaveNetTermsPaymentMethodInput extends NetTermsPaymentMethodInput {
  readonly attemptReference: PaymentAttemptReference;
  readonly billingAddress: PaymentBillingAddress;
}

const fundingFor = (
  profile: AccountCreditProfile,
  checkout: PaymentCheckout
): PaymentMethodFunding => {
  const zero = {
    centAmount: 0,
    currencyCode: checkout.amount.currencyCode,
  };
  if (profile.availableCredit.currencyCode !== checkout.amount.currencyCode) {
    return {
      _tag: "None",
      fundableAmount: zero,
      reason: "currencyMismatch",
      shortfall: checkout.amount,
    };
  }
  if (profile.availableCredit.centAmount >= checkout.amount.centAmount) {
    return { _tag: "Full", fundableAmount: checkout.amount };
  }
  if (profile.availableCredit.centAmount === 0) {
    return {
      _tag: "None",
      fundableAmount: zero,
      reason: "noAvailableFunds",
      shortfall: checkout.amount,
    };
  }
  return {
    _tag: "Partial",
    fundableAmount: profile.availableCredit,
    shortfall: {
      centAmount:
        checkout.amount.centAmount - profile.availableCredit.centAmount,
      currencyCode: checkout.amount.currencyCode,
    },
  };
};

const optionFor = (
  profile: AccountCreditProfile,
  funding: PaymentMethodFunding
): NetTermsPaymentOption => {
  const common = {
    availableCredit: profile.availableCredit,
    displayName: `Net ${profile.termsInDays}`,
    method: "netTerms" as const,
    termsInDays: profile.termsInDays,
  };
  return funding._tag === "Full"
    ? { ...common, availability: "available" }
    : {
        ...common,
        availability: "unavailable",
        unavailableReason: "insufficientAvailableCredit",
      };
};

export class NetTermsPaymentMethod extends Context.Service<
  NetTermsPaymentMethod,
  {
    readonly eligibility: (
      input: NetTermsPaymentMethodInput
    ) => Effect.Effect<
      NetTermsPaymentMethodEligibility,
      PaymentProviderFailure
    >;
    readonly save: (
      input: SaveNetTermsPaymentMethodInput
    ) => Effect.Effect<
      PreparedNetTermsPayment,
      PaymentMethodUnavailable | PaymentProviderFailure
    >;
  }
>()("@repo/payments/NetTermsPaymentMethod") {
  static readonly layer = Layer.effect(
    NetTermsPaymentMethod,
    Effect.gen(function* () {
      const accountCredit = yield* AccountCredit;
      const repository = yield* PaymentRepository;

      const eligibility = Effect.fn("NetTermsPaymentMethod.eligibility")(
        (
          input: NetTermsPaymentMethodInput
        ): Effect.Effect<
          NetTermsPaymentMethodEligibility,
          PaymentProviderFailure
        > =>
          input.buyer.type === "guest"
            ? Effect.succeed({
                _tag: "Ineligible" as const,
                reason: "notApplicable" as const,
              })
            : accountCredit.find(input.buyer.accountReference).pipe(
                Effect.map((profile) =>
                  Option.match(profile, {
                    onNone: () => ({
                      _tag: "Ineligible" as const,
                      reason: "notApproved" as const,
                    }),
                    onSome: (creditProfile) => {
                      const funding = fundingFor(creditProfile, input.checkout);
                      return {
                        _tag: "Eligible" as const,
                        funding,
                        option: optionFor(creditProfile, funding),
                        provider: creditProfile.provider,
                      };
                    },
                  })
                )
              )
      );

      const save = Effect.fn("NetTermsPaymentMethod.save")(
        (input: SaveNetTermsPaymentMethodInput) =>
          Effect.gen(function* () {
            if (input.buyer.type === "guest") {
              return yield* new PaymentMethodUnavailable({
                method: "netTerms",
                reason: "notEligible",
              });
            }
            const assessment = yield* eligibility(input);
            if (assessment._tag === "Ineligible") {
              return yield* new PaymentMethodUnavailable({
                method: "netTerms",
                reason: "notEligible",
              });
            }
            if (assessment.funding._tag !== "Full") {
              return yield* new PaymentMethodUnavailable({
                availableCredit: assessment.option.availableCredit,
                method: "netTerms",
                reason: "insufficientAvailableCredit",
              });
            }
            const preparation = yield* accountCredit.preparePayment({
              accountReference: input.buyer.accountReference,
              attemptReference: input.attemptReference,
              checkout: input.checkout,
            });
            if (preparation.provider !== assessment.provider) {
              return yield* Effect.die(
                new Error(
                  "Account Credit changed provider identity between eligibility and Payment preparation"
                )
              );
            }
            const paymentReference = yield* repository.saveNetTerms({
              attemptReference: input.attemptReference,
              checkout: input.checkout,
              provider: preparation.provider,
              providerReference: preparation.providerReference,
              termsInDays: assessment.option.termsInDays,
            });
            return {
              amount: input.checkout.amount,
              attemptReference: input.attemptReference,
              billingAddress: input.billingAddress,
              method: "netTerms" as const,
              paymentReference,
              termsInDays: assessment.option.termsInDays,
            };
          })
      );

      return NetTermsPaymentMethod.of({ eligibility, save });
    })
  );
}
