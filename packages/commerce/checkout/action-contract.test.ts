import { Result, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { AddressBookReference } from "../domain/address-book";
import { CartId } from "../domain/cart";
import {
  CheckoutCartMismatch,
  CheckoutMutationAddressBookEntryUnavailable,
  CheckoutMutationProviderFailure,
  CheckoutVersionConflict,
} from "../domain/checkout";
import { CommerceRequestContextNotFound } from "../domain/commerce-request-context";
import { CommerceRequestFailure } from "../runtime/commerce-request";
import { CommerceAccountError } from "../services/commerce-accounts";
import {
  SaveCheckoutContactActionResult,
  SaveCheckoutDeliveryDetailsActionResult,
} from "./action-contract";

const actionInputInvalid = {
  _tag: "ActionInputInvalid",
  issues: [{ path: ["email"], message: "This field is invalid." }],
};

const commonCheckoutFailures = [
  actionInputInvalid,
  {
    _tag: "CheckoutMutationSchemaFailure",
    issues: [{ path: "email", message: "This field is invalid." }],
    message: "Checkout input is invalid",
  },
  {
    _tag: "CheckoutMutationSourceUnavailable",
    message: "The selected source is unavailable",
    source: "customerProfile",
  },
  {
    _tag: "CheckoutCartMismatch",
    currentCartId: "cart-current",
    message: "Checkout Cart changed",
    submittedCartId: "cart-submitted",
  },
  {
    _tag: "CheckoutVersionConflict",
    cartId: "cart-1",
    message: "Checkout Cart changed",
  },
  {
    _tag: "CheckoutMutationProviderFailure",
    message: "Checkout provider is unavailable",
    operation: "checkout.save",
  },
  {
    _tag: "CheckoutUnavailable",
    message: "Checkout is unavailable",
    reason: "noCart",
  },
  {
    _tag: "CommerceRequestContextNotFound",
    message: "No Commerce Principal is available",
    reason: "noPrincipal",
  },
  { _tag: "CommerceRequestFailure", operation: "decodeAuthUserId" },
  {
    _tag: "CommerceAccountError",
    message: "Failed to resolve the Commerce Account",
  },
] as const;

const expectFailureRoundTrips = (
  schema: Schema.Codec<unknown, unknown, never, never>,
  failures: readonly unknown[]
) => {
  for (const error of failures) {
    const encoded = {
      _tag: "Failure",
      failure: { displayMessage: "Safe display message", error },
    };
    const decoded = Schema.decodeUnknownSync(schema)(encoded);

    expect(Schema.encodeUnknownSync(schema)(decoded)).toStrictEqual(encoded);
  }
};

describe("checkout action contracts", () => {
  it("serializes the original Cart mismatch tag and both Cart IDs", () => {
    const failure = new CheckoutCartMismatch({
      currentCartId: CartId.make("cart-current"),
      message: "Contact belongs to a different Checkout Cart",
      submittedCartId: CartId.make("cart-submitted"),
    });

    expect(
      Schema.encodeSync(SaveCheckoutContactActionResult)(
        Result.fail({ displayMessage: "Checkout changed", error: failure })
      )
    ).toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "Checkout changed",
        error: {
          _tag: "CheckoutCartMismatch",
          currentCartId: "cart-current",
          message: "Contact belongs to a different Checkout Cart",
          submittedCartId: "cart-submitted",
        },
      },
    });
  });

  it("serializes the original version conflict without an action error code", () => {
    const failure = new CheckoutVersionConflict({
      cartId: CartId.make("cart-1"),
      message: "Checkout Cart changed before Contact could be saved",
    });

    expect(
      Schema.encodeSync(SaveCheckoutContactActionResult)(
        Result.fail({ displayMessage: "Refresh and try again", error: failure })
      )
    ).toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "Refresh and try again",
        error: {
          _tag: "CheckoutVersionConflict",
          cartId: "cart-1",
          message: "Checkout Cart changed before Contact could be saved",
        },
      },
    });
  });

  it("serializes request context failures as the same core error", () => {
    const failure = new CommerceRequestContextNotFound({
      message: "No Commerce Principal is available",
      reason: "noPrincipal",
    });

    expect(
      Schema.encodeSync(SaveCheckoutContactActionResult)(
        Result.fail({ displayMessage: "Checkout not found", error: failure })
      )
    ).toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "Checkout not found",
        error: {
          _tag: "CommerceRequestContextNotFound",
          message: "No Commerce Principal is available",
          reason: "noPrincipal",
        },
      },
    });
  });

  it("keeps safe provider fields and excludes the provider cause", () => {
    const failure = new CheckoutMutationProviderFailure({
      addressBookReference: AddressBookReference.make("saved-office"),
      cause: {
        request: {
          headers: { authorization: "Bearer provider-secret" },
        },
      },
      message: "Commercetools update failed",
      operation: "checkout.deliveryDetails.save",
    });

    expect(
      Schema.encodeSync(SaveCheckoutDeliveryDetailsActionResult)(
        Result.fail({
          displayMessage: "Delivery details could not be saved",
          error: failure,
        })
      )
    ).toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "Delivery details could not be saved",
        error: {
          _tag: "CheckoutMutationProviderFailure",
          addressBookReference: "saved-office",
          message: "Commercetools update failed",
          operation: "checkout.deliveryDetails.save",
        },
      },
    });
  });

  it("keeps the Commerce Account tag and message but excludes its cause", () => {
    const failure = new CommerceAccountError({
      cause: {
        body: { message: "Raw provider diagnostic" },
      },
      message: "Failed to resolve the Commerce Account",
    });

    expect(
      Schema.encodeSync(SaveCheckoutContactActionResult)(
        Result.fail({
          displayMessage: "Checkout is temporarily unavailable",
          error: failure,
        })
      )
    ).toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "Checkout is temporarily unavailable",
        error: {
          _tag: "CommerceAccountError",
          message: "Failed to resolve the Commerce Account",
        },
      },
    });
  });

  it("keeps the Commerce Request tag and operation but excludes its cause", () => {
    const failure = new CommerceRequestFailure({
      cause: new Error("Raw auth user ID diagnostic"),
      operation: "decodeAuthUserId",
    });

    expect(
      Schema.encodeSync(SaveCheckoutContactActionResult)(
        Result.fail({
          displayMessage: "Checkout is temporarily unavailable",
          error: failure,
        })
      )
    ).toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "Checkout is temporarily unavailable",
        error: {
          _tag: "CommerceRequestFailure",
          operation: "decodeAuthUserId",
        },
      },
    });
  });

  it("keeps unavailable Address Book references on their original error", () => {
    const failure = new CheckoutMutationAddressBookEntryUnavailable({
      addressBookReference: AddressBookReference.make("office"),
      message: "Address Book entry is unavailable",
    });

    expect(
      Schema.encodeSync(SaveCheckoutDeliveryDetailsActionResult)(
        Result.fail({
          displayMessage: "Saved address is unavailable",
          error: failure,
        })
      )
    ).toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "Saved address is unavailable",
        error: {
          _tag: "CheckoutMutationAddressBookEntryUnavailable",
          addressBookReference: "office",
          message: "Address Book entry is unavailable",
        },
      },
    });
  });

  it("round-trips every declared Contact failure", () => {
    expectFailureRoundTrips(SaveCheckoutContactActionResult, [
      ...commonCheckoutFailures,
      {
        _tag: "CheckoutMutationUnsupported",
        message: "Saving Contact is unsupported",
        operation: "saveContact",
      },
    ]);
  });

  it("round-trips every declared Delivery Details failure", () => {
    expectFailureRoundTrips(SaveCheckoutDeliveryDetailsActionResult, [
      ...commonCheckoutFailures,
      {
        _tag: "CheckoutMutationAddressBookEntryUnavailable",
        addressBookReference: "office",
        message: "Address Book entry is unavailable",
      },
      {
        _tag: "CheckoutMutationUnsupported",
        message: "Saving Delivery Details is unsupported",
        operation: "saveDeliveryDetails",
      },
    ]);
  });
});
