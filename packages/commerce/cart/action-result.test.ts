import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  AddToCartActionResult,
  RemoveCartLineItemActionResult,
  SetCartLineItemQuantityActionResult,
} from "./action-result";

const actionInputInvalid = {
  _tag: "InputInvalid",
  category: "bad_input",
  code: "input.invalid",
  issues: [{ message: "Invalid input.", path: [] }],
  message: "Invalid input.",
  recovery: "fix_input",
};

const commonCartFailures = [
  actionInputInvalid,
  {
    _tag: "CommerceRequestContextNotFound",
    category: "not_found",
    code: "cart.contextUnavailable",
    message: "The cart is unavailable for the current account.",
    reason: "noPrincipal",
    recovery: "refresh",
  },
  {
    _tag: "CurrentCartSelectionConflict",
    businessUnitId: "business-unit-1",
    cartIds: ["cart-1", "cart-2"],
  },
  { _tag: "CurrentCartUnavailable", reason: "noCart" },
  { _tag: "CartWriteConflict", cartId: "cart-1", operation: "addItem" },
  {
    _tag: "CartWriteOutcomeUnknown",
    cartId: "cart-1",
    operation: "addItem",
  },
  { _tag: "CartProviderFailure", operation: "addItem", reason: "unavailable" },
] as const;

const addToCartFailures = [
  ...commonCartFailures,
  {
    _tag: "CartMerchandiseUnavailable",
    productId: "product-1",
    variantId: "variant-1",
  },
] as const;

const lineItemMutationFailures = [
  ...commonCartFailures,
  {
    _tag: "CartLineItemNotFound",
    cartId: "cart-1",
    lineItemId: "line-item-1",
    operation: "setLineItemQuantity",
  },
] as const;

const expectFailureRoundTrips = (
  schema: Schema.Codec<unknown, unknown>,
  failures: readonly unknown[]
) => {
  for (const failure of failures) {
    const encoded = { _tag: "Failure", failure };
    const decoded = Schema.decodeUnknownSync(schema)(encoded);

    expect(Schema.encodeUnknownSync(schema)(decoded)).toStrictEqual(encoded);
  }
};

describe("Cart action contracts", () => {
  it("round-trips every Add to Cart failure", () => {
    expectFailureRoundTrips(AddToCartActionResult, addToCartFailures);
  });

  it("round-trips every Set Line Item Quantity failure", () => {
    expectFailureRoundTrips(
      SetCartLineItemQuantityActionResult,
      lineItemMutationFailures
    );
  });

  it("round-trips every Remove Line Item failure", () => {
    expectFailureRoundTrips(
      RemoveCartLineItemActionResult,
      lineItemMutationFailures
    );
  });
});
