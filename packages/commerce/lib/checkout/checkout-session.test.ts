import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Layer, Redacted, Schema } from "effect";
import {
  AddressBookAccessDenied,
  AddressBookProviderFailure,
  AddressBookReference,
  SaveAddressBookEntryInput,
} from "../../domain/address-book";
import {
  AnonymousId,
  CartId,
  LineItemId,
  ProductId,
  Sku,
  VariantId,
} from "../../domain/cart";
import {
  CheckoutCartMismatch,
  CheckoutDeliveryDetailsInput,
  type CheckoutDetails,
  CheckoutLocale,
  CheckoutMutationAddressBookEntryUnavailable,
  CheckoutMutationProviderFailure,
  CheckoutMutationSchemaFailure,
  CheckoutMutationSourceUnavailable,
  CheckoutState,
  CheckoutUnavailable,
  CountryCode,
  CountryCodeFromString,
  StorefrontAnonymousCheckoutScope,
} from "../../domain/checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
  CommerceCustomerProfile,
} from "../../domain/commerce-account";
import {
  AnonymousCommercePrincipal,
  AuthUserId,
  CommerceRequestContext,
  CustomerCommercePrincipal,
} from "../../domain/commerce-request-context";
import { AddressBook } from "../../services/address-book";
import { CheckoutSession } from "./checkout-session";
import { toCheckoutScope } from "./request-context";

const money = {
  centAmount: 2500,
  currencyCode: "USD",
} as const;

type TestLineItem = {
  id: LineItemId;
  productId: ProductId;
  name: string;
  quantity: number;
  totalPrice: typeof money;
  variant: {
    id: VariantId;
    sku: Sku;
  };
};

const defaultLineItems: TestLineItem[] = [
  {
    id: LineItemId.make("line-1"),
    productId: ProductId.make("product-1"),
    name: "Hydra Wrench",
    quantity: 1,
    totalPrice: money,
    variant: {
      id: VariantId.make("1"),
      sku: Sku.make("HYDRA-WRENCH"),
    },
  },
];

const cart = ({
  lineItems,
  totalLineItemQuantity,
}: {
  readonly lineItems?: TestLineItem[];
  readonly totalLineItemQuantity?: number;
} = {}) => {
  const resolvedLineItems = lineItems ?? defaultLineItems;

  return {
    id: CartId.make("cart-1"),
    version: 7,
    anonymousId: AnonymousId.make("anon-1"),
    lineItems: resolvedLineItems,
    totalLineItemQuantity:
      totalLineItemQuantity ??
      resolvedLineItems.reduce(
        (total, lineItem) => total + lineItem.quantity,
        0
      ),
    totalPrice: money,
  };
};

const anonymousPrincipal = new AnonymousCommercePrincipal({
  anonymousCartId: CartId.make("cart-1"),
});
const anonymousContext = new CommerceRequestContext({
  locale: CheckoutLocale.make("en-US"),
  principal: anonymousPrincipal,
});
const scope = toCheckoutScope(anonymousContext);

const layerWith = (
  input: {
    readonly currentCart?: ReturnType<typeof cart> | undefined;
    readonly details?: CheckoutDetails;
    readonly cartPolicyViolations?: Parameters<
      typeof CheckoutSession.layerMemoryFrom
    >[0]["cartPolicyViolations"];
    readonly manualContactAllowed?: boolean;
    readonly checkoutPolicies?: Parameters<
      typeof CheckoutSession.layerMemoryFrom
    >[0]["checkoutPolicies"];
    readonly buyerContext?: Parameters<
      typeof CheckoutSession.layerMemoryFrom
    >[0]["buyerContext"];
    readonly customerProfiles?: Parameters<
      typeof CheckoutSession.layerMemoryFrom
    >[0]["customerProfiles"];
    readonly allowedContactSources?: Parameters<
      typeof CheckoutSession.layerMemoryFrom
    >[0]["allowedContactSources"];
    readonly saveDeliveryDetailsFailure?: Parameters<
      typeof CheckoutSession.layerMemoryFrom
    >[0]["saveDeliveryDetailsFailure"];
    readonly addressBookLayer?: Layer.Layer<AddressBook>;
  } = {}
) => {
  const {
    details = {},
    cartPolicyViolations = [],
    manualContactAllowed = true,
    checkoutPolicies = [],
    buyerContext,
    customerProfiles = [],
    allowedContactSources,
    saveDeliveryDetailsFailure,
    addressBookLayer: suppliedAddressBookLayer,
  } = input;
  const currentCart = "currentCart" in input ? input.currentCart : cart();

  const addressBookLayer =
    suppliedAddressBookLayer ?? AddressBook.layerMemory();
  const checkoutLayer = CheckoutSession.layerMemoryFrom({
    ...(currentCart === undefined ? {} : { currentCart }),
    details,
    cartPolicyViolations,
    checkoutPolicies,
    customerProfiles,
    ...(buyerContext === undefined ? {} : { buyerContext }),
    ...(saveDeliveryDetailsFailure === undefined
      ? {}
      : { saveDeliveryDetailsFailure }),
    allowedContactSources:
      allowedContactSources ??
      (manualContactAllowed
        ? ["manual", "customerProfile"]
        : ["customerProfile"]),
  }).pipe(Layer.provide(addressBookLayer));

  return Layer.merge(checkoutLayer, addressBookLayer);
};

const manualContact = {
  source: "manual",
  buyerContact: {
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    phoneNumber: "+15551234567",
  },
} as const;

const customerId = CommerceCustomerId.make("customer-1");
const businessUnitId = CommerceBusinessUnitId.make("business-unit-1");
const customerPrincipal = new CustomerCommercePrincipal({
  authUserId: AuthUserId.make("auth-user-1"),
  customerId,
  businessUnitId,
  businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
});
const customerContext = new CommerceRequestContext({
  locale: CheckoutLocale.make("en-US"),
  principal: customerPrincipal,
});
const customerScope = toCheckoutScope(customerContext);
const completeCustomerProfile = new CommerceCustomerProfile({
  customerId,
  email: Redacted.make("ada@example.com", { label: "email" }),
  firstName: Redacted.make("Ada", { label: "personName" }),
  lastName: Redacted.make("Lovelace", { label: "personName" }),
});

const shippingAddress = {
  addressLine1: "123 Analytical Engine Way",
  addressLine2: "Suite 42",
  postalCode: "SW1A 1AA",
  city: "London",
  country: CountryCode.make("GB"),
  region: "Greater London",
};

const cartOnlyDeliveryDetailsInput = {
  type: "manual",
  saveToAddressBook: false,
  shippingAddress,
} as const;

const manualDeliveryDetails = {
  source: "manual",
  shippingAddress,
} as const;

const updatedCartVersion = cart().version + 1;

describe("CheckoutDeliveryDetailsInput", () => {
  it.effect("decodes every user-selectable Delivery Details input", () =>
    Effect.gen(function* () {
      const inputs = [
        cartOnlyDeliveryDetailsInput,
        {
          type: "manual",
          shippingAddress,
          saveToAddressBook: true,
          makeDefaultShipping: true,
        },
        {
          type: "addressBook",
          addressBookReference: "london-office",
        },
      ];

      const decoded = yield* Effect.forEach(inputs, (input) =>
        Schema.decodeUnknownEffect(CheckoutDeliveryDetailsInput)(input)
      );

      expect(decoded.map((input) => input.type)).toEqual([
        "manual",
        "manual",
        "addressBook",
      ]);
    })
  );
});

describe("CountryCode", () => {
  it.effect("accepts ISO alpha-2 members and rejects lookalike codes", () =>
    Effect.gen(function* () {
      const country = yield* Schema.decodeUnknownEffect(CountryCode)("GB");
      const canonicalCountry = yield* Schema.decodeUnknownEffect(
        CountryCodeFromString
      )(" gb ");
      const invalidExit = yield* Schema.decodeUnknownEffect(CountryCode)(
        "ZZ"
      ).pipe(Effect.exit);

      expect(country).toBe("GB");
      expect(canonicalCountry).toBe("GB");
      expect(Exit.isFailure(invalidExit)).toBe(true);
    })
  );
});

describe("CheckoutLocale", () => {
  it.effect("accepts configured locales and rejects arbitrary strings", () =>
    Effect.gen(function* () {
      const locale = yield* Schema.decodeUnknownEffect(CheckoutLocale)("de-DE");
      const unsupportedExit = yield* Schema.decodeUnknownEffect(CheckoutLocale)(
        "en-CA"
      ).pipe(Effect.exit);
      const inheritedPropertyExit = yield* Schema.decodeUnknownEffect(
        CheckoutLocale
      )("toString").pipe(Effect.exit);

      expect(locale).toBe("de-DE");
      expect(Exit.isFailure(unsupportedExit)).toBe(true);
      expect(Exit.isFailure(inheritedPropertyExit)).toBe(true);
    })
  );
});

describe("CheckoutSession.getCurrent", () => {
  it.effect(
    "gets an incomplete checkout state from an existing non-empty Cart",
    () =>
      Effect.gen(function* () {
        const state = yield* CheckoutSession.getCurrent(scope);

        expect(state.cart.id).toBe("cart-1");
        expect(state.cart.lineItems).toHaveLength(1);
        expect(state.steps.map((step) => [step.id, step.status])).toEqual([
          ["contact", "incomplete"],
          ["deliveryDetails", "incomplete"],
          ["shippingOptions", "incomplete"],
          ["paymentOptions", "incomplete"],
          ["reviewOrder", "incomplete"],
        ]);
        expect(state.activeStep).toBe("contact");
        expect(state.violations).toEqual([]);

        const decoded = yield* Schema.decodeUnknownEffect(CheckoutState)(state);
        expect(decoded.activeStep).toBe("contact");
        expect(decoded.details).toEqual({});
      }).pipe(Effect.provide(layerWith()))
  );

  it.effect(
    "fails before rendering checkout when the current Cart is empty",
    () =>
      Effect.gen(function* () {
        const exit = yield* CheckoutSession.getCurrent(scope).pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(exit.cause.toString()).toContain("CheckoutUnavailable");
        }
      }).pipe(
        Effect.provide(
          layerWith({
            currentCart: cart({ lineItems: [], totalLineItemQuantity: 0 }),
          })
        )
      )
  );

  it.effect(
    "fails before provider setup when no current Cart can be resolved",
    () =>
      Effect.gen(function* () {
        const error = yield* CheckoutSession.getCurrent(
          new StorefrontAnonymousCheckoutScope({
            channel: "storefrontAnonymous",
            locale: CheckoutLocale.make("en-US"),
          })
        ).pipe(
          Effect.provide(layerWith({ currentCart: undefined })),
          Effect.flip
        );

        expect(error).toBeInstanceOf(CheckoutUnavailable);
        if (error._tag === "CheckoutUnavailable") {
          expect(error.reason).toBe("noCart");
        }
      })
  );

  it.effect("advances the active step when Contact details are complete", () =>
    Effect.gen(function* () {
      const state = yield* CheckoutSession.getCurrent(scope);

      expect(state.steps[0]).toMatchObject({
        id: "contact",
        status: "complete",
      });
      expect(state.activeStep).toBe("deliveryDetails");
    }).pipe(
      Effect.provide(
        layerWith({
          details: {
            contact: {
              source: "manual",
              buyerContact: {
                email: "ada@example.com",
                firstName: "Ada",
                lastName: "Lovelace",
              },
            },
          },
        })
      )
    )
  );

  it.effect(
    "keeps Checkout Step status binary while exposing global violations",
    () =>
      Effect.gen(function* () {
        const state = yield* CheckoutSession.getCurrent(scope).pipe(
          Effect.provide(
            layerWith({
              cartPolicyViolations: [
                {
                  policyName: "guest-max-limits",
                  violationType: "MAX_GUEST_TOTAL_ITEMS_EXCEEDED",
                  message: "Guest carts are limited to 50 total items.",
                },
              ],
            })
          )
        );

        expect(new Set(state.steps.map((step) => step.status))).toEqual(
          new Set(["incomplete"])
        );
        expect(state.violations).toMatchObject([
          {
            source: "cartPolicy",
            severity: "blocking",
          },
        ]);
      })
  );
});

describe("CheckoutSession.saveContact", () => {
  it.effect("saves Manual Contact and recomputes Contact as complete", () =>
    Effect.gen(function* () {
      yield* CheckoutSession.saveContact({
        scope,
        cart: { id: CartId.make("cart-1"), version: 7 },
        contact: manualContact,
      });

      const state = yield* CheckoutSession.getCurrent(scope);

      expect(state.details.contact).toEqual(manualContact);
      expect(state.steps[0]).toMatchObject({
        id: "contact",
        status: "complete",
      });
      expect(state.activeStep).toBe("deliveryDetails");
    }).pipe(Effect.provide(layerWith()))
  );

  it.effect(
    "resolves Customer Profile Contact for the verified customer scope",
    () =>
      Effect.gen(function* () {
        yield* CheckoutSession.saveContact({
          scope: customerScope,
          cart: { id: CartId.make("cart-1"), version: 7 },
          contact: { source: "customerProfile" },
        });

        const state = yield* CheckoutSession.getCurrent(customerScope);

        expect(state.details.contact).toEqual({
          source: "customerProfile",
          buyerContact: {
            email: "ada@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
          },
        });
        expect(state.steps[0]).toMatchObject({
          id: "contact",
          status: "complete",
        });
      }).pipe(
        Effect.provide(
          layerWith({
            buyerContext: {
              buyerMode: "b2bCustomer",
              requiresBuyingContext: true,
              buyingContext: { businessUnitId },
            },
            customerProfiles: [completeCustomerProfile],
            allowedContactSources: ["customerProfile"],
          })
        )
      )
  );

  it.effect(
    "rejects Customer Profile Contact when a required profile field is missing",
    () =>
      Effect.gen(function* () {
        const error = yield* CheckoutSession.saveContact({
          scope: customerScope,
          cart: { id: CartId.make("cart-1"), version: 7 },
          contact: { source: "customerProfile" },
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(CheckoutMutationSchemaFailure);
        expect(error.message).toContain("lastName");
      }).pipe(
        Effect.provide(
          layerWith({
            customerProfiles: [
              new CommerceCustomerProfile({
                customerId,
                email: Redacted.make("ada@example.com", { label: "email" }),
                firstName: Redacted.make("Ada", { label: "personName" }),
              }),
            ],
            allowedContactSources: ["customerProfile"],
          })
        )
      )
  );

  it.effect(
    "rejects Customer Profile Contact without a verified customer scope",
    () =>
      Effect.gen(function* () {
        const error = yield* CheckoutSession.saveContact({
          scope,
          cart: { id: CartId.make("cart-1"), version: 7 },
          contact: { source: "customerProfile" },
        }).pipe(Effect.flip);

        expect(error).toMatchObject({
          _tag: "CheckoutMutationSourceUnavailable",
          source: "customerProfile",
        });
      }).pipe(
        Effect.provide(
          layerWith({
            customerProfiles: [completeCustomerProfile],
            allowedContactSources: ["customerProfile"],
          })
        )
      )
  );

  it.effect(
    "keeps Contact incomplete when B2B Buying Context is unresolved",
    () =>
      Effect.gen(function* () {
        yield* CheckoutSession.saveContact({
          scope: customerScope,
          cart: { id: CartId.make("cart-1"), version: 7 },
          contact: { source: "customerProfile" },
        });

        const state = yield* CheckoutSession.getCurrent(customerScope);

        expect(state.details.contact?.source).toBe("customerProfile");
        expect(state.steps[0]).toMatchObject({
          id: "contact",
          status: "incomplete",
        });
        expect(state.activeStep).toBe("contact");
      }).pipe(
        Effect.provide(
          layerWith({
            buyerContext: {
              buyerMode: "b2bCustomer",
              requiresBuyingContext: true,
            },
            customerProfiles: [completeCustomerProfile],
            allowedContactSources: ["customerProfile"],
          })
        )
      )
  );

  it.effect(
    "re-evaluates saved Customer Profile Contact against current source policy",
    () =>
      Effect.gen(function* () {
        const state = yield* CheckoutSession.getCurrent(customerScope);

        expect(state.steps[0]).toMatchObject({
          id: "contact",
          status: "incomplete",
        });
      }).pipe(
        Effect.provide(
          layerWith({
            details: {
              contact: {
                source: "customerProfile",
                buyerContact: {
                  email: "ada@example.com",
                  firstName: "Ada",
                  lastName: "Lovelace",
                },
              },
            },
            buyerContext: {
              buyerMode: "b2bCustomer",
              requiresBuyingContext: true,
              buyingContext: { businessUnitId },
            },
            allowedContactSources: ["manual"],
          })
        )
      )
  );

  it.effect("replaces Manual Contact idempotently on repeated saves", () =>
    Effect.gen(function* () {
      yield* CheckoutSession.saveContact({
        scope,
        cart: { id: CartId.make("cart-1"), version: 7 },
        contact: manualContact,
      });
      const firstState = yield* CheckoutSession.getCurrent(scope);

      yield* CheckoutSession.saveContact({
        scope,
        cart: {
          id: firstState.cart.id,
          version: firstState.cart.version,
        },
        contact: manualContact,
      });
      const secondState = yield* CheckoutSession.getCurrent(scope);

      expect(secondState.details.contact).toEqual(manualContact);
      expect(secondState.cart.lineItems).toHaveLength(1);
      expect(secondState.cart.version).toBe(firstState.cart.version);
    }).pipe(Effect.provide(layerWith()))
  );

  it.effect("rejects invalid Manual Contact details", () =>
    Effect.gen(function* () {
      const error = yield* CheckoutSession.saveContact({
        scope,
        cart: { id: CartId.make("cart-1"), version: 7 },
        contact: {
          ...manualContact,
          buyerContact: {
            ...manualContact.buyerContact,
            email: " ",
          },
        },
      }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(CheckoutMutationSchemaFailure);
      expect(error.message).toContain("email");
    }).pipe(Effect.provide(layerWith()))
  );

  it.effect(
    "rejects Manual Contact when the current checkout disallows it",
    () =>
      Effect.gen(function* () {
        const error = yield* CheckoutSession.saveContact({
          scope,
          cart: { id: CartId.make("cart-1"), version: 7 },
          contact: manualContact,
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(CheckoutMutationSourceUnavailable);
        if (error._tag === "CheckoutMutationSourceUnavailable") {
          expect(error.source).toBe("manual");
        }
      }).pipe(Effect.provide(layerWith({ manualContactAllowed: false })))
  );

  it.effect("saves Contact against the current Cart version", () =>
    Effect.gen(function* () {
      yield* CheckoutSession.saveContact({
        scope,
        cart: { id: CartId.make("cart-1"), version: 6 },
        contact: manualContact,
      });
      const state = yield* CheckoutSession.getCurrent(scope);

      expect(state.details.contact).toEqual(manualContact);
      expect(state.cart.version).toBe(updatedCartVersion);
    }).pipe(Effect.provide(layerWith()))
  );

  it.effect("rejects details submitted for a different Cart", () =>
    Effect.gen(function* () {
      const error = yield* CheckoutSession.saveContact({
        scope,
        cart: { id: CartId.make("cart-other"), version: 7 },
        contact: manualContact,
      }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(CheckoutCartMismatch);
      if (error._tag === "CheckoutCartMismatch") {
        expect(error.submittedCartId).toBe("cart-other");
        expect(error.currentCartId).toBe("cart-1");
      }
    }).pipe(Effect.provide(layerWith()))
  );

  it.effect("reports unavailable checkout when saving without a Cart", () =>
    Effect.gen(function* () {
      const error = yield* CheckoutSession.saveContact({
        scope,
        cart: { id: CartId.make("cart-1"), version: 7 },
        contact: manualContact,
      }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(CheckoutUnavailable);
      if (error._tag === "CheckoutUnavailable") {
        expect(error.reason).toBe("noCart");
      }
    }).pipe(Effect.provide(layerWith({ currentCart: undefined })))
  );
});

describe("CheckoutSession.saveDeliveryDetails", () => {
  const detailsWithCompleteContact: CheckoutDetails = {
    contact: manualContact,
  };

  it.effect(
    "saves Manual Delivery Details and recomputes Delivery Details as complete",
    () =>
      Effect.gen(function* () {
        yield* CheckoutSession.saveDeliveryDetails({
          context: anonymousContext,
          cart: { id: CartId.make("cart-1"), version: 7 },
          deliveryDetails: cartOnlyDeliveryDetailsInput,
        });

        const state = yield* CheckoutSession.getCurrent(scope);

        expect(state.details.deliveryDetails).toEqual(manualDeliveryDetails);
        expect(state.steps[1]).toMatchObject({
          id: "deliveryDetails",
          status: "complete",
        });
        expect(state.activeStep).toBe("shippingOptions");
      }).pipe(
        Effect.provide(layerWith({ details: detailsWithCompleteContact }))
      )
  );

  it.effect(
    "replaces Manual Delivery Details idempotently on repeated saves",
    () =>
      Effect.gen(function* () {
        yield* CheckoutSession.saveDeliveryDetails({
          context: anonymousContext,
          cart: { id: CartId.make("cart-1"), version: 7 },
          deliveryDetails: cartOnlyDeliveryDetailsInput,
        });
        const firstState = yield* CheckoutSession.getCurrent(scope);

        yield* CheckoutSession.saveDeliveryDetails({
          context: anonymousContext,
          cart: {
            id: firstState.cart.id,
            version: firstState.cart.version,
          },
          deliveryDetails: cartOnlyDeliveryDetailsInput,
        });
        const secondState = yield* CheckoutSession.getCurrent(scope);

        expect(secondState.details.deliveryDetails).toEqual(
          manualDeliveryDetails
        );
        expect(secondState.cart.version).toBe(firstState.cart.version);
      }).pipe(
        Effect.provide(layerWith({ details: detailsWithCompleteContact }))
      )
  );

  it.effect(
    "saves a new Shipping Address to the Business Unit Address Book before using it",
    () =>
      Effect.gen(function* () {
        yield* CheckoutSession.saveDeliveryDetails({
          context: customerContext,
          cart: { id: CartId.make("cart-1"), version: 7 },
          deliveryDetails: {
            type: "manual",
            shippingAddress,
            saveToAddressBook: true,
            makeDefaultShipping: true,
          },
        });

        const state = yield* CheckoutSession.getCurrent(customerScope);
        const entries = yield* AddressBook.pipe(
          Effect.flatMap((addressBook) => addressBook.list(customerPrincipal))
        );

        expect(state.details.deliveryDetails).toMatchObject({
          source: "addressBook",
          shippingAddress,
        });
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
          reference:
            state.details.deliveryDetails?.source === "addressBook"
              ? state.details.deliveryDetails.addressBookReference
              : undefined,
          address: shippingAddress,
          types: ["shipping"],
          defaultShipping: true,
          defaultBilling: false,
        });
      }).pipe(
        Effect.provide(layerWith({ details: detailsWithCompleteContact }))
      )
  );

  it.effect(
    "uses the canonical Shipping Address from an existing Address Book Entry",
    () =>
      Effect.gen(function* () {
        const addressBook = yield* AddressBook;
        const reference = AddressBookReference.make("london-office");
        const canonicalAddress = {
          ...shippingAddress,
          addressLine1: "10 Canonical Way",
        };
        yield* addressBook.save(
          customerPrincipal,
          new SaveAddressBookEntryInput({
            reference,
            address: canonicalAddress,
            types: ["shipping"],
            defaultShipping: false,
            defaultBilling: false,
          })
        );

        yield* CheckoutSession.saveDeliveryDetails({
          context: customerContext,
          cart: { id: CartId.make("cart-1"), version: 7 },
          deliveryDetails: {
            type: "addressBook",
            addressBookReference: reference,
          },
        });

        const state = yield* CheckoutSession.getCurrent(customerScope);
        expect(state.details.deliveryDetails).toEqual({
          source: "addressBook",
          addressBookReference: reference,
          shippingAddress: canonicalAddress,
        });
      }).pipe(
        Effect.provide(layerWith({ details: detailsWithCompleteContact }))
      )
  );

  it.effect(
    "rejects missing and Billing-only Address Book Entries before changing the Cart",
    () =>
      Effect.gen(function* () {
        const addressBook = yield* AddressBook;
        const billingReference = AddressBookReference.make("billing-office");
        yield* addressBook.save(
          customerPrincipal,
          new SaveAddressBookEntryInput({
            reference: billingReference,
            address: shippingAddress,
            types: ["billing"],
            defaultShipping: false,
            defaultBilling: true,
          })
        );

        const references = [
          AddressBookReference.make("missing-office"),
          billingReference,
        ];
        const errors = yield* Effect.forEach(references, (reference) =>
          CheckoutSession.saveDeliveryDetails({
            context: customerContext,
            cart: { id: CartId.make("cart-1"), version: 7 },
            deliveryDetails: {
              type: "addressBook",
              addressBookReference: reference,
            },
          }).pipe(Effect.flip)
        );
        const state = yield* CheckoutSession.getCurrent(customerScope);

        expect(
          errors.every(
            (error) =>
              error instanceof CheckoutMutationAddressBookEntryUnavailable
          )
        ).toBe(true);
        expect(state.cart.version).toBe(cart().version);
        expect(state.details.deliveryDetails).toBeUndefined();
      }).pipe(Effect.provide(layerWith()))
  );

  it.effect("rejects Address Book intents for anonymous Checkout", () =>
    Effect.gen(function* () {
      const errors = yield* Effect.forEach(
        [
          {
            type: "manual" as const,
            shippingAddress,
            saveToAddressBook: true as const,
            makeDefaultShipping: false,
          },
          {
            type: "addressBook" as const,
            addressBookReference: AddressBookReference.make("office"),
          },
        ],
        (deliveryDetails) =>
          CheckoutSession.saveDeliveryDetails({
            context: anonymousContext,
            cart: { id: CartId.make("cart-1"), version: 7 },
            deliveryDetails,
          }).pipe(Effect.flip)
      );

      expect(errors).toMatchObject([
        {
          _tag: "CheckoutMutationSourceUnavailable",
          source: "addressBook",
        },
        {
          _tag: "CheckoutMutationSourceUnavailable",
          source: "addressBook",
        },
      ]);
    }).pipe(Effect.provide(layerWith()))
  );

  it.effect(
    "maps Address Book access denial to an unavailable Delivery Details source",
    () => {
      const deniedLayer = Layer.succeed(
        AddressBook,
        AddressBook.of({
          list: () => Effect.die("not used"),
          get: () =>
            Effect.fail(
              new AddressBookAccessDenied({
                message: "Buyer cannot access the Address Book",
                operation: "get",
              })
            ),
          save: () => Effect.die("not used"),
        })
      );

      return Effect.gen(function* () {
        const error = yield* CheckoutSession.saveDeliveryDetails({
          context: customerContext,
          cart: { id: CartId.make("cart-1"), version: 7 },
          deliveryDetails: {
            type: "addressBook",
            addressBookReference: AddressBookReference.make("office"),
          },
        }).pipe(Effect.flip);

        expect(error).toMatchObject({
          _tag: "CheckoutMutationSourceUnavailable",
          source: "addressBook",
        });
      }).pipe(Effect.provide(layerWith({ addressBookLayer: deniedLayer })));
    }
  );

  it.effect(
    "maps Address Book provider failures with operation context",
    () => {
      const failingLayer = Layer.succeed(
        AddressBook,
        AddressBook.of({
          list: () => Effect.die("not used"),
          get: () => Effect.die("not used"),
          save: () =>
            Effect.fail(
              new AddressBookProviderFailure({
                message: "Business Unit update failed",
                operation: "save",
              })
            ),
        })
      );

      return Effect.gen(function* () {
        const error = yield* CheckoutSession.saveDeliveryDetails({
          context: customerContext,
          cart: { id: CartId.make("cart-1"), version: 7 },
          deliveryDetails: {
            type: "manual",
            shippingAddress,
            saveToAddressBook: true,
            makeDefaultShipping: false,
          },
        }).pipe(Effect.flip);

        expect(error).toMatchObject({
          _tag: "CheckoutMutationProviderFailure",
          operation: "checkout.deliveryDetails.addressBook.save",
        });
      }).pipe(Effect.provide(layerWith({ addressBookLayer: failingLayer })));
    }
  );

  it.effect("returns the saved reference when the Cart phase fails", () =>
    Effect.gen(function* () {
      const error = yield* CheckoutSession.saveDeliveryDetails({
        context: customerContext,
        cart: { id: CartId.make("cart-1"), version: 7 },
        deliveryDetails: {
          type: "manual",
          shippingAddress,
          saveToAddressBook: true,
          makeDefaultShipping: false,
        },
      }).pipe(Effect.flip);
      const entries = yield* AddressBook.pipe(
        Effect.flatMap((addressBook) => addressBook.list(customerPrincipal))
      );

      expect(error).toMatchObject({
        _tag: "CheckoutMutationProviderFailure",
        addressBookReference: entries[0]?.reference,
      });
      expect(entries).toHaveLength(1);
    }).pipe(
      Effect.provide(
        layerWith({
          saveDeliveryDetailsFailure: new CheckoutMutationProviderFailure({
            message: "Commercetools update failed",
            operation: "checkout.deliveryDetails.save",
          }),
        })
      )
    )
  );

  it.effect(
    "saves a Business Unit address against the current Cart version",
    () =>
      Effect.gen(function* () {
        yield* CheckoutSession.saveDeliveryDetails({
          context: customerContext,
          cart: { id: CartId.make("cart-1"), version: 6 },
          deliveryDetails: {
            type: "manual",
            shippingAddress,
            saveToAddressBook: true,
            makeDefaultShipping: false,
          },
        });
        const state = yield* CheckoutSession.getCurrent(customerScope);
        const entries = yield* AddressBook.pipe(
          Effect.flatMap((addressBook) => addressBook.list(customerPrincipal))
        );

        expect(entries).toHaveLength(1);
        expect(state.details.deliveryDetails).toMatchObject({
          source: "addressBook",
          shippingAddress,
        });
        expect(state.cart.version).toBe(updatedCartVersion);
      }).pipe(Effect.provide(layerWith()))
  );

  it.effect("rejects invalid Manual Shipping Address input", () =>
    Effect.gen(function* () {
      const error = yield* CheckoutSession.saveDeliveryDetails({
        context: anonymousContext,
        cart: { id: CartId.make("cart-1"), version: 7 },
        deliveryDetails: {
          ...cartOnlyDeliveryDetailsInput,
          shippingAddress: {
            ...cartOnlyDeliveryDetailsInput.shippingAddress,
            postalCode: " ",
          },
        },
      }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(CheckoutMutationSchemaFailure);
      expect(error.message).toContain("postalCode");
    }).pipe(Effect.provide(layerWith()))
  );

  it.effect("reports provider failures as Checkout Mutation Failures", () =>
    Effect.gen(function* () {
      const error = yield* CheckoutSession.saveDeliveryDetails({
        context: anonymousContext,
        cart: { id: CartId.make("cart-1"), version: 7 },
        deliveryDetails: cartOnlyDeliveryDetailsInput,
      }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(CheckoutMutationProviderFailure);
    }).pipe(
      Effect.provide(
        layerWith({
          saveDeliveryDetailsFailure: new CheckoutMutationProviderFailure({
            message: "Commercetools update failed",
            operation: "checkout.deliveryDetails.save",
          }),
        })
      )
    )
  );

  it.effect("saves Delivery Details against the current Cart version", () =>
    Effect.gen(function* () {
      yield* CheckoutSession.saveDeliveryDetails({
        context: anonymousContext,
        cart: { id: CartId.make("cart-1"), version: 6 },
        deliveryDetails: cartOnlyDeliveryDetailsInput,
      });
      const state = yield* CheckoutSession.getCurrent(scope);

      expect(state.details.deliveryDetails).toEqual(manualDeliveryDetails);
      expect(state.cart.version).toBe(updatedCartVersion);
    }).pipe(Effect.provide(layerWith()))
  );

  it.effect(
    "saves a structurally valid address even when Checkout Policy reports a violation",
    () =>
      Effect.gen(function* () {
        yield* CheckoutSession.saveDeliveryDetails({
          context: anonymousContext,
          cart: { id: CartId.make("cart-1"), version: 7 },
          deliveryDetails: cartOnlyDeliveryDetailsInput,
        });

        const state = yield* CheckoutSession.getCurrent(scope);

        expect(state.details.deliveryDetails).toEqual(manualDeliveryDetails);
        expect(state.steps[1]?.status).toBe("complete");
        expect(state.violations).toMatchObject([
          {
            source: "checkoutPolicy",
            code: "shipping.region.unsupported",
          },
        ]);
      }).pipe(
        Effect.provide(
          layerWith({
            details: detailsWithCompleteContact,
            checkoutPolicies: [
              {
                name: "shipping-region",
                evaluate: ({ details }) =>
                  details.deliveryDetails?.shippingAddress.region ===
                  "Greater London"
                    ? [
                        {
                          code: "shipping.region.unsupported",
                          message: "Shipping to Greater London is unsupported",
                          targets: [
                            {
                              type: "checkoutStep",
                              step: "shippingOptions",
                            },
                          ],
                        },
                      ]
                    : [],
              },
            ],
          })
        )
      )
  );
});
