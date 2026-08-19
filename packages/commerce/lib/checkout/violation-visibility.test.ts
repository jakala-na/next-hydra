import { describe, expect, it } from "vitest";

import { ProductId } from "../../domain/cart";
import type { CheckoutViolation } from "../../domain/checkout";
import {
  isVisibleForCheckoutStep,
  isVisibleInCartSidebar,
} from "./violation-visibility";

const violation = (
  targets: CheckoutViolation["targets"]
): CheckoutViolation => ({
  code: "checkout.blocked",
  severity: "blocking",
  source: "checkoutPolicy",
  targets,
});

describe("Checkout violation visibility", () => {
  it("shows global, whole-Cart, and cart-item violations in the Cart sidebar", () => {
    expect(isVisibleInCartSidebar(violation([]))).toBeTruthy();
    expect(isVisibleInCartSidebar(violation([{ type: "cart" }]))).toBeTruthy();
    expect(
      isVisibleInCartSidebar(
        violation([
          {
            productId: ProductId.make("product-1"),
            type: "cartItem",
          },
        ])
      )
    ).toBeTruthy();
    expect(
      isVisibleInCartSidebar(
        violation([{ step: "deliveryDetails", type: "checkoutStep" }])
      )
    ).toBeFalsy();
  });

  it("shows a step-targeted violation only for its Checkout Step", () => {
    const stepViolation = violation([
      { step: "deliveryDetails", type: "checkoutStep" },
    ]);

    expect(
      isVisibleForCheckoutStep(stepViolation, "deliveryDetails")
    ).toBeTruthy();
    expect(isVisibleForCheckoutStep(stepViolation, "contact")).toBeFalsy();
    expect(
      isVisibleForCheckoutStep(violation([]), "deliveryDetails")
    ).toBeFalsy();
  });
});
