import { PaymentProvider, PreparedPaymentReference } from "@repo/payments";
import type { PaymentMethodOption } from "@repo/payments";
import { describe, expect, it } from "vitest";

import { availablePaymentMethod } from "./payment-method-selection";

const methods = [
  {
    availability: "available",
    displayName: "Card",
    input: {
      clientIntegration: {
        clientToken: "client-token",
        provider: PaymentProvider.make("Stripe"),
        publicConfiguration: "public-configuration",
      },
      preparationReference: PreparedPaymentReference.make("preparation"),
    },
    method: "card",
  },
  {
    availability: "unavailable",
    availableCredit: { centAmount: 1_600_000, currencyCode: "USD" },
    displayName: "Net 30",
    method: "netTerms",
    termsInDays: 30,
    unavailableReason: "insufficientAvailableCredit",
  },
] as const satisfies readonly PaymentMethodOption[];

describe(availablePaymentMethod, () => {
  it("falls back when the previously saved Payment Method is unavailable", () => {
    expect(availablePaymentMethod(methods, "netTerms")).toBe("card");
  });
});
