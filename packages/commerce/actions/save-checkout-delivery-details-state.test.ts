import { describe, expect, it } from "vitest";
import { CartId } from "../domain/cart";
import {
  CheckoutMutationProviderFailure,
  CheckoutMutationSchemaFailure,
  CheckoutVersionConflict,
} from "../domain/checkout";
import { checkoutDeliveryDetailsMutationFailureToActionState } from "./save-checkout-delivery-details-state";

describe("checkoutDeliveryDetailsMutationFailureToActionState", () => {
  it("keeps validation failures visible to the checkout form", () => {
    expect(
      checkoutDeliveryDetailsMutationFailureToActionState(
        new CheckoutMutationSchemaFailure({
          message: "Manual Shipping Address city is required",
        })
      )
    ).toEqual({
      status: "error",
      code: "checkout.deliveryDetails.invalidInput",
      message: "Manual Shipping Address city is required",
    });
  });

  it("keeps version conflicts visible to the checkout form", () => {
    expect(
      checkoutDeliveryDetailsMutationFailureToActionState(
        new CheckoutVersionConflict({
          message:
            "Checkout Cart changed before Delivery Details could be saved",
          cartId: CartId.make("cart-1"),
        })
      )
    ).toEqual({
      status: "error",
      code: "checkout.versionConflict",
      message: "Checkout Cart changed before Delivery Details could be saved",
    });
  });

  it("hides provider failure details from the checkout form", () => {
    expect(
      checkoutDeliveryDetailsMutationFailureToActionState(
        new CheckoutMutationProviderFailure({
          message: "Commercetools update failed",
          operation: "checkout.deliveryDetails.save",
        })
      )
    ).toEqual({
      status: "error",
      code: "checkout.deliveryDetails.providerFailure",
      message: "Delivery details could not be saved. Try again.",
    });
  });
});
