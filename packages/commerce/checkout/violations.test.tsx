import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProductId } from "../domain/cart";
import type { CheckoutViolation } from "../domain/checkout";
import { checkoutViolationMessage } from "../lib/checkout/violation-message";
import { CommerceLocale } from "../store";
import { CartSidebarViolations, CheckoutStepViolations } from "./violations";

const violations = [
  {
    code: "unknown.global.violation",
    severity: "blocking",
    source: "checkoutPolicy",
    targets: [],
  },
  {
    code: "INCOMPATIBLE_CART_ITEMS",
    severity: "blocking",
    source: "cartPolicy",
    targets: [{ type: "cart" }],
  },
  {
    code: "MAX_GUEST_TOTAL_ITEMS_EXCEEDED",
    parameters: {
      excessQuantity: 1,
      maxQuantity: 50,
    },
    severity: "blocking",
    source: "cartPolicy",
    targets: [
      {
        productId: ProductId.make("product-1"),
        type: "cartItem",
      },
    ],
  },
  {
    code: "SHIPPING_ADDRESS_RESTRICTED",
    severity: "blocking",
    source: "checkoutPolicy",
    targets: [{ step: "shippingOptions", type: "checkoutStep" }],
  },
  {
    code: "POLICY_ERROR",
    severity: "blocking",
    source: "checkoutPolicy",
    targets: [{ step: "contact", type: "checkoutStep" }],
  },
] as const satisfies readonly CheckoutViolation[];

const locale = CommerceLocale.make("de-DE");
const messages = {
  attention: "Achtung",
  cartViolations: "Probleme mit dem Warenkorb",
  violation: (violation: CheckoutViolation) =>
    checkoutViolationMessage(locale, violation),
};

describe("Checkout violation rendering", () => {
  it("renders localized cart and Checkout Step violations in their respective components", () => {
    const sidebarHtml = renderToStaticMarkup(
      <CartSidebarViolations messages={messages} violations={violations} />
    );
    const checkoutStepHtml = renderToStaticMarkup(
      <CheckoutStepViolations
        messages={messages}
        step="shippingOptions"
        violations={violations}
      />
    );

    expect({
      checkoutStepAttention: checkoutStepHtml.includes("Achtung"),
      checkoutStepCartViolation: checkoutStepHtml.includes(
        "Diese Artikel können nicht zusammen gekauft werden."
      ),
      checkoutStepProviderViolation: checkoutStepHtml.includes(
        "Die Checkout-Verfügbarkeit konnte nicht geprüft werden."
      ),
      checkoutStepShippingViolation: checkoutStepHtml.includes(
        "Ein oder mehrere Artikel können nicht an diese Adresse geliefert werden."
      ),
      sidebarBlockingViolation: sidebarHtml.includes(
        "Der Checkout kann erst fortgesetzt werden, wenn dieses Problem behoben ist."
      ),
      sidebarCartViolation: sidebarHtml.includes(
        "Diese Artikel können nicht zusammen gekauft werden."
      ),
      sidebarQuantityViolation: sidebarHtml.includes(
        "Gastwarenkörbe sind auf 50 Artikel begrenzt. Entfernen Sie mindestens 1 Artikel."
      ),
      sidebarShippingViolation: sidebarHtml.includes(
        "Ein oder mehrere Artikel können nicht an diese Adresse geliefert werden."
      ),
      sidebarTitle: sidebarHtml.includes("Probleme mit dem Warenkorb"),
    }).toStrictEqual({
      checkoutStepAttention: true,
      checkoutStepCartViolation: false,
      checkoutStepProviderViolation: false,
      checkoutStepShippingViolation: true,
      sidebarBlockingViolation: true,
      sidebarCartViolation: true,
      sidebarQuantityViolation: true,
      sidebarShippingViolation: false,
      sidebarTitle: true,
    });
  });
});
