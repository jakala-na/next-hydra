import type { PaymentAmount } from "../domain";

export type PaymentMethodIneligibilityReason = "notApplicable" | "notApproved";

export interface IneligiblePaymentMethod {
  readonly _tag: "Ineligible";
  readonly reason: PaymentMethodIneligibilityReason;
}

export type PaymentMethodEligibility<Eligible extends object> =
  | IneligiblePaymentMethod
  | ({ readonly _tag: "Eligible" } & Eligible);

export type PaymentMethodFunding =
  | {
      readonly _tag: "Full";
      readonly fundableAmount: PaymentAmount;
    }
  | {
      readonly _tag: "Partial";
      readonly fundableAmount: PaymentAmount;
      readonly shortfall: PaymentAmount;
    }
  | {
      readonly _tag: "None";
      readonly fundableAmount: PaymentAmount;
      readonly reason: "currencyMismatch" | "noAvailableFunds";
      readonly shortfall: PaymentAmount;
    };
