import { describe, expect, it } from "vitest";
import { CartId } from "../domain/cart";
import {
  CheckoutMutationProviderFailure,
  CheckoutMutationSchemaFailure,
  CheckoutMutationSourceUnavailable,
  CheckoutMutationUnsupported,
  CheckoutVersionConflict,
} from "../domain/checkout";
import { checkoutMutationFailureToActionState } from "./save-checkout-contact-state";

describe("checkoutMutationFailureToActionState", () => {
  it("keeps validation failures visible to the checkout form", () => {
    expect(
      checkoutMutationFailureToActionState(
        new CheckoutMutationSchemaFailure({
          message: "Manual Contact email is required",
        })
      )
    ).toEqual({
      status: "error",
      code: "checkout.contact.invalidInput",
      message: "Manual Contact email is required",
    });
  });

  it("keeps disallowed source failures visible to the checkout form", () => {
    expect(
      checkoutMutationFailureToActionState(
        new CheckoutMutationSourceUnavailable({
          message: "Manual Contact Source is unavailable for this checkout",
          source: "manual",
        })
      )
    ).toEqual({
      status: "error",
      code: "checkout.contact.sourceUnavailable",
      message: "Manual Contact Source is unavailable for this checkout",
    });
  });

  it("keeps version conflicts visible to the checkout form", () => {
    expect(
      checkoutMutationFailureToActionState(
        new CheckoutVersionConflict({
          message: "Checkout Cart changed before Contact could be saved",
          cartId: CartId.make("cart-1"),
        })
      )
    ).toEqual({
      status: "error",
      code: "checkout.versionConflict",
      message: "Checkout Cart changed before Contact could be saved",
    });
  });

  it("hides provider failure details from the checkout form", () => {
    expect(
      checkoutMutationFailureToActionState(
        new CheckoutMutationProviderFailure({
          message: "Commercetools update failed",
          operation: "checkout.contact.save",
        })
      )
    ).toEqual({
      status: "error",
      code: "checkout.contact.providerFailure",
      message: "Contact could not be saved. Try again.",
    });
  });

  it("maps unsupported contact mutations to a visible form error", () => {
    expect(
      checkoutMutationFailureToActionState(
        new CheckoutMutationUnsupported({
          message:
            "saveContact is implemented by a later Checkout Session slice",
          operation: "saveContact",
        })
      )
    ).toEqual({
      status: "error",
      code: "checkout.contact.unsupported",
      message: "This contact source is not supported yet.",
    });
  });
});
