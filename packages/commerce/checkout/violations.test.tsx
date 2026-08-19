import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProductId } from "../domain/cart";
import type { CheckoutViolation } from "../domain/checkout";
import { checkoutViolationMessage } from "../lib/checkout/violation-message";
import { CommerceLocale } from "../store";
import { ActiveStepViolations, CartSidebarViolations } from "./violations";

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
  it("renders localized cart and active-step violations in their respective components", () => {
    const sidebarHtml = renderToStaticMarkup(
      <CartSidebarViolations messages={messages} violations={violations} />
    );
    const activeStepHtml = renderToStaticMarkup(
      <ActiveStepViolations
        activeStep="shippingOptions"
        messages={messages}
        violations={violations}
      />
    );

    expect(sidebarHtml).toContain("Probleme mit dem Warenkorb");
    expect(sidebarHtml).toContain(
      "Der Checkout kann erst fortgesetzt werden, wenn dieses Problem behoben ist."
    );
    expect(sidebarHtml).toContain(
      "Diese Artikel können nicht zusammen gekauft werden."
    );
    expect(sidebarHtml).toContain(
      "Gastwarenkörbe sind auf 50 Artikel begrenzt. Entfernen Sie mindestens 1 Artikel."
    );
    expect(sidebarHtml).not.toContain(
      "Ein oder mehrere Artikel können nicht an diese Adresse geliefert werden."
    );

    expect(activeStepHtml).toContain("Achtung");
    expect(activeStepHtml).toContain(
      "Ein oder mehrere Artikel können nicht an diese Adresse geliefert werden."
    );
    expect(activeStepHtml).not.toContain(
      "Diese Artikel können nicht zusammen gekauft werden."
    );
    expect(activeStepHtml).not.toContain(
      "Die Checkout-Verfügbarkeit konnte nicht geprüft werden."
    );
  });
});
