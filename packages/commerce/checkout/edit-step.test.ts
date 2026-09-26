import { Option, Schema } from "effect";
import { describe, expect, it } from "vitest";

import type { CheckoutState } from "../domain/checkout-state";
import { CheckoutEditStepId, checkoutEditedStepFor } from "./edit-step";

const completedCheckout = {
  nextStep: "reviewOrder",
  steps: [
    { id: "contact", status: "complete" },
    { id: "deliveryDetails", status: "complete" },
    { id: "shippingOptions", status: "complete" },
    { id: "paymentOptions", status: "complete" },
    { id: "reviewOrder", status: "incomplete" },
  ],
} satisfies Pick<CheckoutState, "nextStep" | "steps">;

describe("Checkout edit steps", () => {
  it("accepts only steps that can be edited", () => {
    expect(
      Option.isSome(Schema.decodeOption(CheckoutEditStepId)("deliveryDetails"))
    ).toBeTruthy();
    expect(
      Option.isNone(
        Schema.decodeUnknownOption(CheckoutEditStepId)("reviewOrder")
      )
    ).toBeTruthy();
  });

  it("opens a requested completed step", () => {
    expect(checkoutEditedStepFor(completedCheckout, "deliveryDetails")).toBe(
      "deliveryDetails"
    );
  });

  it("does not open incomplete or future steps", () => {
    const deliveryNext = {
      nextStep: "deliveryDetails",
      steps: completedCheckout.steps.map((step) => ({
        ...step,
        status:
          step.id === "contact" || step.id === "paymentOptions"
            ? step.status
            : ("incomplete" as const),
      })),
    } satisfies Pick<CheckoutState, "nextStep" | "steps">;

    expect(
      checkoutEditedStepFor(deliveryNext, "paymentOptions")
    ).toBeUndefined();
    expect(checkoutEditedStepFor(deliveryNext, undefined)).toBeUndefined();
  });
});
