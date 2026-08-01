import { describe, expect, it } from "vitest";
import { CartId } from "../domain/cart";
import {
  CheckoutCartMismatch,
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
    });
  });

  it("distinguishes a submitted Cart from the current Checkout Cart", () => {
    expect(
      checkoutMutationFailureToActionState(
        new CheckoutCartMismatch({
          message: "Contact belongs to a different Checkout Cart",
          submittedCartId: CartId.make("cart-old"),
          currentCartId: CartId.make("cart-current"),
        })
      )
    ).toEqual({
      status: "error",
      code: "checkout.cartMismatch",
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
    });
  });
});
