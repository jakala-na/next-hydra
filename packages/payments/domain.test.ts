import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { PaymentOptions } from "./domain";

const amount = { centAmount: 1_700_000, currencyCode: "USD" };

describe(PaymentOptions, () => {
  it("rejects contradictory Payment Method availability states", () => {
    const invalidOptions: readonly unknown[] = [
      {
        amount,
        methods: [
          {
            availability: "available",
            displayName: "Card",
            method: "card",
          },
        ],
      },
      {
        amount,
        methods: [
          {
            availability: "unavailable",
            availableCredit: amount,
            displayName: "Net 30",
            method: "netTerms",
            termsInDays: 30,
          },
        ],
      },
    ];

    expect(invalidOptions.map(Schema.is(PaymentOptions))).toStrictEqual([
      false,
      false,
    ]);
  });

  it("does not retain an unavailable reason for available Net Terms", () => {
    const options = Schema.decodeUnknownSync(PaymentOptions)({
      amount,
      methods: [
        {
          availability: "available",
          availableCredit: amount,
          displayName: "Net 30",
          method: "netTerms",
          termsInDays: 30,
          unavailableReason: "insufficientAvailableCredit",
        },
      ],
    });

    expect(options.methods).toStrictEqual([
      {
        availability: "available",
        availableCredit: amount,
        displayName: "Net 30",
        method: "netTerms",
        termsInDays: 30,
      },
    ]);
  });
});
