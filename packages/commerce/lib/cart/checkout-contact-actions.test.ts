import { describe, expect, it } from "vitest";
import type { CheckoutContact } from "../../domain/checkout";
import {
  buildSaveCheckoutContactActions,
  hasPersistedCheckoutContact,
} from "./checkout-contact-actions";

const contact = {
  source: "manual",
  buyerContact: {
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  },
} as const satisfies CheckoutContact;

const customerProfileContact = {
  source: "customerProfile",
  buyerContact: {
    email: "profile@example.com",
    firstName: "Profile",
    lastName: "Buyer",
  },
} as const satisfies CheckoutContact;

describe("buildSaveCheckoutContactActions", () => {
  it("sets the checkout custom type for carts without custom fields", () => {
    const result = buildSaveCheckoutContactActions(
      {
        custom: null,
      },
      contact
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data[1]).toMatchObject({
      setCustomType: {
        typeKey: "orderCustomFields",
      },
    });
  });

  it("sets only the checkout contact field when the checkout custom type is present", () => {
    const result = buildSaveCheckoutContactActions(
      {
        custom: {
          type: {
            key: "orderCustomFields",
          },
          customFieldsRaw: [],
        },
      },
      contact
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data[1]).toMatchObject({
      setCustomField: {
        name: "checkoutContact",
      },
    });
  });

  it("stores resolved Customer Profile details as cart-owned contact details", () => {
    const result = buildSaveCheckoutContactActions(
      {
        custom: null,
      },
      customerProfileContact
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data[0]).toEqual({
      setCustomerEmail: {
        email: "profile@example.com",
      },
    });

    const customTypeAction = result.data[1];
    expect(customTypeAction).toHaveProperty("setCustomType");
    if (!(customTypeAction && "setCustomType" in customTypeAction)) {
      return;
    }

    const storedContact = JSON.parse(
      JSON.parse(customTypeAction.setCustomType.fields[0].value)
    );
    expect(storedContact).toEqual(customerProfileContact);
  });

  it("does not replace an unexpected existing cart custom type", () => {
    const result = buildSaveCheckoutContactActions(
      {
        custom: {
          type: {
            key: "other-cart-fields",
          },
          customFieldsRaw: [],
        },
      },
      contact
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      code: "BAD_INPUT",
      message: "Cart custom type cannot store checkout contact",
      details: {
        actualTypeKey: "other-cart-fields",
        expectedTypeKey: "orderCustomFields",
      },
    });
  });

  it("does not replace existing cart custom fields when the custom type key is unavailable", () => {
    const result = buildSaveCheckoutContactActions(
      {
        custom: {
          type: null,
          customFieldsRaw: [
            {
              name: "externalIntegrationState",
              value: "kept elsewhere",
            },
          ],
        },
      },
      contact
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      code: "BAD_INPUT",
      message: "Cart custom type cannot store checkout contact",
      details: {
        actualTypeKey: "<unavailable>",
        expectedTypeKey: "orderCustomFields",
      },
    });
  });
});

describe("hasPersistedCheckoutContact", () => {
  it("requires matching checkout details and customer email", () => {
    expect(
      hasPersistedCheckoutContact(
        {
          customerEmail: "ada@example.com",
          checkoutDetails: {
            contact,
          },
        },
        contact
      )
    ).toBe(true);

    expect(
      hasPersistedCheckoutContact(
        {
          customerEmail: null,
          checkoutDetails: {
            contact,
          },
        },
        contact
      )
    ).toBe(false);
  });
});
