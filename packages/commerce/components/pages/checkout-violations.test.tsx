import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductId } from "../../domain/cart";
import { CheckoutLocale, type CheckoutViolation } from "../../domain/checkout";
import { checkoutViolationMessage } from "../../lib/checkout/violation-message";
import {
  ActiveStepViolations,
  CartSidebarViolations,
} from "./checkout-violations";

const violations = [
  {
    source: "checkoutPolicy",
    severity: "blocking",
    code: "unknown.global.violation",
    targets: [],
  },
  {
    source: "cartPolicy",
    severity: "blocking",
    code: "INCOMPATIBLE_CART_ITEMS",
    targets: [{ type: "cart" }],
  },
  {
    source: "cartPolicy",
    severity: "blocking",
    code: "MAX_GUEST_TOTAL_ITEMS_EXCEEDED",
    parameters: {
      excessQuantity: 1,
      maxQuantity: 50,
    },
    targets: [
      {
        type: "cartItem",
        productId: ProductId.make("product-1"),
      },
    ],
  },
  {
    source: "checkoutPolicy",
    severity: "blocking",
    code: "SHIPPING_ADDRESS_RESTRICTED",
    targets: [{ type: "checkoutStep", step: "shippingOptions" }],
  },
  {
    source: "checkoutPolicy",
    severity: "blocking",
    code: "POLICY_ERROR",
    targets: [{ type: "checkoutStep", step: "contact" }],
  },
] as const satisfies readonly CheckoutViolation[];

const locale = CheckoutLocale.make("de-DE");
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
