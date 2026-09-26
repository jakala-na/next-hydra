import { describe, expect, it } from "vitest";

import { shouldRevalidatePaymentOptions } from "./commerce-action-cache-policy";

describe(shouldRevalidatePaymentOptions, () => {
  it("refreshes Payment Options when current credit makes the selected method unavailable", () => {
    expect(
      shouldRevalidatePaymentOptions({
        _tag: "Failure",
        failure: { _tag: "CheckoutPaymentMethodUnavailable" },
      })
    ).toBeTruthy();
  });
});
