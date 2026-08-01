import { describe, expect, it } from "vitest";
import { AddressBookReference } from "../domain/address-book";
import { CartId } from "../domain/cart";
import {
  CheckoutCartMismatch,
  CheckoutMutationAddressBookEntryUnavailable,
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
    });
  });

  it("keeps unavailable saved-address identity for reselection", () => {
    const addressBookReference = AddressBookReference.make("office");

    expect(
      checkoutDeliveryDetailsMutationFailureToActionState(
        new CheckoutMutationAddressBookEntryUnavailable({
          message: "Address Book entry is unavailable",
          addressBookReference,
        })
      )
    ).toEqual({
      status: "error",
      code: "checkout.deliveryDetails.addressBookEntryUnavailable",
      parameters: { addressBookReference },
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
    });
  });

  it("distinguishes a submitted Cart from the current Checkout Cart", () => {
    expect(
      checkoutDeliveryDetailsMutationFailureToActionState(
        new CheckoutCartMismatch({
          message: "Delivery Details belong to a different Checkout Cart",
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
      checkoutDeliveryDetailsMutationFailureToActionState(
        new CheckoutMutationProviderFailure({
          message: "Commercetools update failed",
          operation: "checkout.deliveryDetails.save",
        })
      )
    ).toEqual({
      status: "error",
      code: "checkout.deliveryDetails.providerFailure",
    });
  });

  it("returns a saved reference needed to retry only the Cart phase", () => {
    const addressBookReference = AddressBookReference.make("saved-office");

    expect(
      checkoutDeliveryDetailsMutationFailureToActionState(
        new CheckoutMutationProviderFailure({
          message: "Commercetools update failed",
          operation: "checkout.deliveryDetails.save",
          addressBookReference,
        })
      )
    ).toEqual({
      status: "error",
      code: "checkout.deliveryDetails.providerFailure",
      parameters: { addressBookReference },
    });
  });
});
