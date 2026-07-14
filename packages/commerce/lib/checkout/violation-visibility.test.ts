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
  source: "checkoutPolicy",
  severity: "blocking",
  code: "checkout.blocked",
  targets,
});

describe("Checkout violation visibility", () => {
  it("shows global, whole-Cart, and cart-item violations in the Cart sidebar", () => {
    expect(isVisibleInCartSidebar(violation([]))).toBe(true);
    expect(isVisibleInCartSidebar(violation([{ type: "cart" }]))).toBe(true);
    expect(
      isVisibleInCartSidebar(
        violation([
          {
            type: "cartItem",
            productId: ProductId.make("product-1"),
          },
        ])
      )
    ).toBe(true);
    expect(
      isVisibleInCartSidebar(
        violation([{ type: "checkoutStep", step: "deliveryDetails" }])
      )
    ).toBe(false);
  });

  it("shows a step-targeted violation only for its Checkout Step", () => {
    const stepViolation = violation([
      { type: "checkoutStep", step: "deliveryDetails" },
    ]);

    expect(isVisibleForCheckoutStep(stepViolation, "deliveryDetails")).toBe(
      true
    );
    expect(isVisibleForCheckoutStep(stepViolation, "contact")).toBe(false);
    expect(isVisibleForCheckoutStep(violation([]), "deliveryDetails")).toBe(
      false
    );
  });
});
