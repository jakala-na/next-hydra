import { createCheckoutTranslator } from "@repo/i18n/checkout-messages";
import { describe, expect, it } from "vitest";

import type { SaveCheckoutContactActionFailure } from "./action-contract";
import { contactSourceAfterAction } from "./contact-form";

const incompleteProfileFailure = {
  displayMessage:
    "Your customer profile is missing required contact information. Enter it below to continue.",
  error: {
    _tag: "CheckoutCustomerProfileIncomplete",
    category: "bad_input",
    code: "checkout.contact.customerProfileIncomplete",
    message: "Customer Profile is incomplete",
    missingFields: ["email", "lastName"],
    recovery: "fix_input",
  },
} as const satisfies SaveCheckoutContactActionFailure;

describe("Checkout Contact form recovery", () => {
  it("explains that required Customer Profile contact information is missing", () => {
    const t = createCheckoutTranslator("en-US");

    expect(t("errors.saveContact.CheckoutCustomerProfileIncomplete")).toBe(
      "Your customer profile is missing required contact information. Enter it below to continue."
    );
  });

  it("opens Manual Contact after an incomplete Customer Profile failure", () => {
    expect(
      contactSourceAfterAction(incompleteProfileFailure, "customerProfile")
    ).toBe("manual");
  });

  it("keeps the selected source for unrelated failures", () => {
    expect(contactSourceAfterAction(undefined, "customerProfile")).toBe(
      "customerProfile"
    );
  });
});
