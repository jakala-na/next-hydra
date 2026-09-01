import { ErrorIssue, makeInputInvalid } from "@repo/errors";
import { Effect, Result, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { AddressBookReference } from "../domain/address-book";
import { CartId } from "../domain/cart";
import { CartProviderFailure } from "../domain/cart-errors";
import {
  CheckoutCartMismatch,
  CheckoutCustomerProfileIncomplete,
  CheckoutMutationAddressBookEntryUnavailable,
  CheckoutMutationIssue,
  CheckoutMutationOutcomeUnknown,
  CheckoutMutationProviderFailure,
  CheckoutMutationSchemaFailure,
  CheckoutMutationSourceUnavailable,
  CheckoutShippingOptionsRefreshRequired,
  CheckoutShippingSelectionUnavailable,
  CheckoutUnavailable,
  CheckoutVersionConflict,
} from "../domain/checkout";
import { CommerceRequestContextNotFound } from "../domain/commerce-request-context";
import {
  DeliveryPlanQuoteReference,
  DeliveryPlanReference,
  ShippingOptionReference,
} from "../domain/delivery-plan";
import { retainRecoverableCheckoutProviderFailure } from "../lib/checkout/failure-policy";
import { CommerceAccountUnavailable } from "../services/commerce-accounts";
import {
  SaveCheckoutContactActionResult,
  SaveCheckoutDeliveryDetailsActionResult,
  SaveCheckoutShippingOptionsActionResult,
} from "./action-contract";
import {
  projectSaveCheckoutContactFailure,
  projectSaveCheckoutDeliveryDetailsFailure,
  projectSaveCheckoutShippingOptionsFailure,
} from "./public-errors";

const inputInvalid = makeInputInvalid({
  issues: [
    new ErrorIssue({
      message: "This field is invalid.",
      path: ["email"],
    }),
  ],
  message: "Invalid input.",
});

const schemaFailure = new CheckoutMutationSchemaFailure({
  issues: [
    new CheckoutMutationIssue({
      message: "Email is invalid",
      path: "email",
    }),
  ],
  message: "Checkout input is invalid",
});
const sourceUnavailable = new CheckoutMutationSourceUnavailable({
  message: "The selected source is unavailable",
  source: "customerProfile",
});
const customerProfileIncomplete = new CheckoutCustomerProfileIncomplete({
  message: "Customer Profile is incomplete",
  missingFields: ["email", "lastName"],
});
const cartMismatch = new CheckoutCartMismatch({
  currentCartId: CartId.make("cart-current"),
  message: "Checkout Cart changed",
  submittedCartId: CartId.make("cart-submitted"),
});
const versionConflict = new CheckoutVersionConflict({
  cartId: CartId.make("cart-1"),
  message: "Checkout Cart changed",
});
const contactOutcomeUnknown = new CheckoutMutationOutcomeUnknown({
  cartId: CartId.make("cart-1"),
  message: "Contact write outcome is unknown",
  operation: "saveContact",
});
const deliveryOutcomeUnknown = new CheckoutMutationOutcomeUnknown({
  addressBookReference: AddressBookReference.make("saved-office"),
  cartId: CartId.make("cart-1"),
  message: "Delivery Details write outcome is unknown",
  operation: "saveDeliveryDetails",
});
const checkoutUnavailable = new CheckoutUnavailable({
  message: "Checkout is unavailable",
  reason: "noCart",
});
const shippingOutcomeUnknown = new CheckoutMutationOutcomeUnknown({
  cartId: CartId.make("cart-1"),
  message: "Shipping Options write outcome is unknown",
  operation: "saveShippingOptions",
});
const contextNotFound = new CommerceRequestContextNotFound({
  message: "No Commerce Principal is available",
  reason: "noPrincipal",
});
const accountFailure = new CommerceAccountUnavailable({
  cause: { body: { message: "Raw provider diagnostic" } },
  message: "Failed to resolve the Commerce Account",
});

const contactFailures = [
  inputInvalid,
  projectSaveCheckoutContactFailure(schemaFailure, "en-US"),
  projectSaveCheckoutContactFailure(sourceUnavailable, "en-US"),
  projectSaveCheckoutContactFailure(customerProfileIncomplete, "en-US"),
  projectSaveCheckoutContactFailure(cartMismatch, "en-US"),
  projectSaveCheckoutContactFailure(versionConflict, "en-US"),
  projectSaveCheckoutContactFailure(contactOutcomeUnknown, "en-US"),
  projectSaveCheckoutContactFailure(
    new CheckoutMutationProviderFailure({
      cause: { provider: "private" },
      message: "Provider diagnostic",
      operation: "checkout.contact.save",
      reason: "unavailable",
    }),
    "en-US"
  ),
  projectSaveCheckoutContactFailure(checkoutUnavailable, "en-US"),
  projectSaveCheckoutContactFailure(contextNotFound, "en-US"),
  projectSaveCheckoutContactFailure(accountFailure, "en-US"),
] as const;

const deliveryFailures = [
  inputInvalid,
  projectSaveCheckoutDeliveryDetailsFailure(schemaFailure, "en-US"),
  projectSaveCheckoutDeliveryDetailsFailure(sourceUnavailable, "en-US"),
  projectSaveCheckoutDeliveryDetailsFailure(
    new CheckoutMutationAddressBookEntryUnavailable({
      addressBookReference: AddressBookReference.make("office"),
      message: "Address Book entry is unavailable",
    }),
    "en-US"
  ),
  projectSaveCheckoutDeliveryDetailsFailure(cartMismatch, "en-US"),
  projectSaveCheckoutDeliveryDetailsFailure(versionConflict, "en-US"),
  projectSaveCheckoutDeliveryDetailsFailure(deliveryOutcomeUnknown, "en-US"),
  projectSaveCheckoutDeliveryDetailsFailure(
    new CheckoutMutationProviderFailure({
      addressBookReference: AddressBookReference.make("office"),
      cause: { provider: "private" },
      message: "Provider diagnostic",
      operation: "checkout.deliveryDetails.save",
      reason: "unavailable",
    }),
    "en-US"
  ),
  projectSaveCheckoutDeliveryDetailsFailure(checkoutUnavailable, "en-US"),
  projectSaveCheckoutDeliveryDetailsFailure(contextNotFound, "en-US"),
  projectSaveCheckoutDeliveryDetailsFailure(accountFailure, "en-US"),
] as const;

const shippingFailures = [
  inputInvalid,
  projectSaveCheckoutShippingOptionsFailure(schemaFailure, "en-US"),
  projectSaveCheckoutShippingOptionsFailure(
    new CheckoutShippingSelectionUnavailable({
      message: "Shipping selection is stale",
      planReference: DeliveryPlanReference.make("plan-1"),
      quoteReference: DeliveryPlanQuoteReference.make("quote-1"),
      shippingOptionReference: ShippingOptionReference.make("standard"),
    }),
    "en-US"
  ),
  projectSaveCheckoutShippingOptionsFailure(cartMismatch, "en-US"),
  projectSaveCheckoutShippingOptionsFailure(versionConflict, "en-US"),
  projectSaveCheckoutShippingOptionsFailure(shippingOutcomeUnknown, "en-US"),
  projectSaveCheckoutShippingOptionsFailure(
    new CheckoutShippingOptionsRefreshRequired({
      cartId: CartId.make("cart-1"),
      message: "Saved but refresh failed",
    }),
    "en-US"
  ),
  projectSaveCheckoutShippingOptionsFailure(
    new CheckoutMutationProviderFailure({
      cause: { provider: "private" },
      message: "Provider diagnostic",
      operation: "checkout.shippingOptions.save",
      reason: "unavailable",
    }),
    "en-US"
  ),
  projectSaveCheckoutShippingOptionsFailure(checkoutUnavailable, "en-US"),
  projectSaveCheckoutShippingOptionsFailure(contextNotFound, "en-US"),
  projectSaveCheckoutShippingOptionsFailure(accountFailure, "en-US"),
] as const;

const expectFailureRoundTrips = (
  schema: Schema.Codec<unknown, unknown>,
  failures: readonly unknown[]
) => {
  for (const error of failures) {
    const encoded = {
      _tag: "Failure",
      failure: { displayMessage: "Safe display message", error },
    };
    const decoded = Schema.decodeSync(schema)(encoded);

    // oxlint-disable-next-line vitest/prefer-strict-equal -- Encoding intentionally converts schema classes to plain wire objects.
    expect(Schema.encodeUnknownSync(schema)(decoded)).toEqual(encoded);
  }
};

describe("checkout action contracts", () => {
  it("keeps exact tags, broad categories, and safe conflict identifiers", () => {
    const projected = projectSaveCheckoutContactFailure(cartMismatch, "en-US");

    expect(projected).toMatchObject({
      _tag: "CheckoutCartMismatch",
      category: "conflict",
      code: "checkout.cartMismatch",
      currentCartId: "cart-current",
      recovery: "refresh",
      submittedCartId: "cart-submitted",
    });
  });

  it("treats a stale Address Book selection as a refreshable conflict", () => {
    const projected = projectSaveCheckoutDeliveryDetailsFailure(
      new CheckoutMutationAddressBookEntryUnavailable({
        addressBookReference: AddressBookReference.make("office"),
        message: "Address Book entry is unavailable",
      }),
      "en-US"
    );

    expect(projected).toMatchObject({
      _tag: "CheckoutMutationAddressBookEntryUnavailable",
      category: "conflict",
      recovery: "refresh",
    });
  });

  it("preserves missing Customer Profile fields as fixable unprocessable content", () => {
    const projected = projectSaveCheckoutContactFailure(
      customerProfileIncomplete,
      "en-US"
    );

    expect(projected).toMatchObject({
      _tag: "CheckoutCustomerProfileIncomplete",
      category: "bad_input",
      code: "checkout.contact.customerProfileIncomplete",
      message:
        "Your customer profile is missing required contact information. Enter it below to continue.",
      missingFields: ["email", "lastName"],
      recovery: "fix_input",
    });
  });

  it("removes provider causes and diagnostic operations from the public projection", () => {
    const provider = projectSaveCheckoutDeliveryDetailsFailure(
      new CheckoutMutationProviderFailure({
        addressBookReference: AddressBookReference.make("saved-office"),
        cause: { authorization: "Bearer provider-secret" },
        message: "Commercetools update failed",
        operation: "checkout.deliveryDetails.save",
        reason: "unavailable",
      }),
      "en-US"
    );

    expect(provider).toMatchObject({
      _tag: "CheckoutMutationProviderFailure",
      addressBookReference: "saved-office",
      category: "unavailable",
      recovery: "retry",
    });
    expect(provider).not.toHaveProperty("cause");
    expect(provider).not.toHaveProperty("operation");
  });

  it("preserves safe retry references for ambiguous Delivery Details writes", () => {
    const outcome = projectSaveCheckoutDeliveryDetailsFailure(
      deliveryOutcomeUnknown,
      "en-US"
    );

    expect(outcome).toMatchObject({
      _tag: "CheckoutMutationOutcomeUnknown",
      addressBookReference: "saved-office",
      cartId: "cart-1",
      category: "unavailable",
      code: "checkout.deliveryDetails.outcomeUnknown",
      recovery: "refresh",
    });
  });

  it("round-trips every declared Contact failure", () => {
    expect.assertions(contactFailures.length);
    expectFailureRoundTrips(SaveCheckoutContactActionResult, contactFailures);
  });

  it("round-trips every declared Delivery Details failure", () => {
    expect.assertions(deliveryFailures.length);
    expectFailureRoundTrips(
      SaveCheckoutDeliveryDetailsActionResult,
      deliveryFailures
    );
  });

  it("round-trips every declared Shipping Options failure", () => {
    expect.assertions(shippingFailures.length);
    expectFailureRoundTrips(
      SaveCheckoutShippingOptionsActionResult,
      shippingFailures
    );
  });

  it("distinguishes a confirmed Shipping Options save from a retryable outage", () => {
    const projected = projectSaveCheckoutShippingOptionsFailure(
      new CheckoutShippingOptionsRefreshRequired({
        cartId: CartId.make("cart-1"),
        message: "Saved but refresh failed",
      }),
      "en-US"
    );

    expect(projected).toMatchObject({
      _tag: "CheckoutShippingOptionsRefreshRequired",
      cartId: "cart-1",
      code: "checkout.shippingOptions.refreshRequired",
      recovery: "refresh",
    });
  });

  it("encodes a projected failure through Schema.Result", () => {
    const failure = projectSaveCheckoutContactFailure(versionConflict, "en-US");

    expect(
      Schema.encodeSync(SaveCheckoutContactActionResult)(
        Result.fail({ displayMessage: failure.message, error: failure })
      )
    ).toMatchObject({
      _tag: "Failure",
      failure: {
        error: {
          _tag: "CheckoutVersionConflict",
          category: "conflict",
          code: "checkout.versionConflict",
        },
      },
    });
  });

  it("keeps classified outages in E", async () => {
    const unavailable = new CheckoutMutationProviderFailure({
      cause: new CartProviderFailure({
        operation: "saveContact",
        reason: "unavailable",
      }),
      message: "Provider unavailable",
      operation: "checkout.contact.save",
      reason: "unavailable",
    });
    await expect(
      Effect.runPromise(
        retainRecoverableCheckoutProviderFailure(unavailable).pipe(Effect.flip)
      )
    ).resolves.toBe(unavailable);
  });

  it.each([
    { label: "invalid provider data", reason: "invalidData" as const },
    {
      label: "an unexpected provider response",
      reason: "unexpectedResponse" as const,
    },
  ])("defects on $label", async ({ reason }) => {
    const failure = new CheckoutMutationProviderFailure({
      cause: new CartProviderFailure({
        operation: "saveContact",
        reason,
      }),
      message: "Provider contract failure",
      operation: "checkout.contact.save",
      reason,
    });

    await expect(
      Effect.runPromise(
        retainRecoverableCheckoutProviderFailure(failure).pipe(Effect.flip)
      )
    ).rejects.toBeDefined();
  });
});
