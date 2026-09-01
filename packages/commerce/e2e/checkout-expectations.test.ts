import { describe, expect, it } from "vitest";

import {
  matchesVariantAttributes,
  minorAmountFromDecimal,
} from "./checkout-expectations";

describe(minorAmountFromDecimal, () => {
  it("preserves fractional minor units", () => {
    expect(minorAmountFromDecimal("16500.01")).toBe("1650001");
    expect(minorAmountFromDecimal("0.10")).toBe("10");
  });

  it("rejects amounts with unsupported precision", () => {
    expect(() => minorAmountFromDecimal("16500.001")).toThrow(
      "Expected a non-negative monetary amount"
    );
  });
});

describe(matchesVariantAttributes, () => {
  const attributes = [
    { name: "Model / Year", value: "2015 / Special" },
    { name: "Color", value: "Red" },
  ];

  it("matches exact name/value pairs independently of DataTable row order", () => {
    expect(
      matchesVariantAttributes(
        attributes,
        new Map([
          ["Color", "Red"],
          ["Model / Year", "2015 / Special"],
        ])
      )
    ).toBeTruthy();
  });

  it("rejects swapped values and partial attribute sets", () => {
    expect(
      matchesVariantAttributes(
        attributes,
        new Map([
          ["Model / Year", "Red"],
          ["Color", "2015 / Special"],
        ])
      )
    ).toBeFalsy();
    expect(
      matchesVariantAttributes(
        attributes,
        new Map([["Model / Year", "2015 / Special"]])
      )
    ).toBeFalsy();
  });
});
