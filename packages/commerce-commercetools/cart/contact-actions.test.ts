import { CheckoutContact } from "@repo/commerce/domain/checkout";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  buildSaveCheckoutContactActions,
  hasPersistedCheckoutContact,
} from "./contact-actions";

const contact = {
  buyerContact: {
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  },
  source: "manual",
} as const satisfies CheckoutContact;

const customerProfileContact = {
  buyerContact: {
    email: "profile@example.com",
    firstName: "Profile",
    lastName: "Buyer",
  },
  source: "customerProfile",
} as const satisfies CheckoutContact;

describe(buildSaveCheckoutContactActions, () => {
  it("sets the checkout custom type for carts without custom fields", () => {
    const actions = Effect.runSync(
      buildSaveCheckoutContactActions(
        {
          custom: null,
        },
        contact
      )
    );

    expect(actions[1]).toMatchObject({
      setCustomType: {
        typeKey: "orderCustomFields",
      },
    });
  });

  it("sets only the checkout contact field when the checkout custom type is present", () => {
    const actions = Effect.runSync(
      buildSaveCheckoutContactActions(
        {
          custom: {
            customFieldsRaw: [],
            type: {
              key: "orderCustomFields",
            },
          },
        },
        contact
      )
    );

    expect(actions[1]).toMatchObject({
      setCustomField: {
        name: "checkoutContact",
      },
    });
  });

  it("stores resolved Customer Profile details as cart-owned contact details", () => {
    const actions = Effect.runSync(
      buildSaveCheckoutContactActions(
        {
          custom: null,
        },
        customerProfileContact
      )
    );

    expect(actions[0]).toStrictEqual({
      setCustomerEmail: {
        email: "profile@example.com",
      },
    });

    const [, customTypeAction] = actions;
    expect(customTypeAction).toHaveProperty("setCustomType");
    if (!(customTypeAction && "setCustomType" in customTypeAction)) {
      return;
    }

    const encodedContact = customTypeAction.setCustomType.fields.at(0)?.value;
    const storedContact = Schema.decodeUnknownSync(
      Schema.fromJsonString(Schema.fromJsonString(CheckoutContact))
    )(encodedContact);
    expect(storedContact).toStrictEqual(customerProfileContact);
  });

  it("does not replace an unexpected existing cart custom type", () => {
    const result = Effect.runSync(
      Effect.result(
        buildSaveCheckoutContactActions(
          {
            custom: {
              customFieldsRaw: [],
              type: {
                key: "other-cart-fields",
              },
            },
          },
          contact
        )
      )
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Success") {
      return;
    }

    expect(result.failure).toMatchObject({
      _tag: "CartProviderFailure",
      operation: "saveContact",
      reason: "invalidData",
    });
    expect(String(result.failure.cause)).toContain("orderCustomFields");
  });

  it("does not replace existing cart custom fields when the custom type key is unavailable", () => {
    const result = Effect.runSync(
      Effect.result(
        buildSaveCheckoutContactActions(
          {
            custom: {
              customFieldsRaw: [
                {
                  name: "externalIntegrationState",
                  value: "kept elsewhere",
                },
              ],
              type: null,
            },
          },
          contact
        )
      )
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Success") {
      return;
    }

    expect(result.failure).toMatchObject({
      _tag: "CartProviderFailure",
      operation: "saveContact",
      reason: "invalidData",
    });
    expect(String(result.failure.cause)).toContain("SchemaError");
  });
});

describe(hasPersistedCheckoutContact, () => {
  it("requires matching checkout details and customer email", () => {
    expect(
      hasPersistedCheckoutContact(
        {
          checkoutDetails: {
            contact,
          },
          customerEmail: "ada@example.com",
        },
        contact
      )
    ).toBeTruthy();

    expect(
      hasPersistedCheckoutContact(
        {
          checkoutDetails: {
            contact,
          },
          customerEmail: null,
        },
        contact
      )
    ).toBeFalsy();
  });
});
