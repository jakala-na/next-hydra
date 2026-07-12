import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";
import {
  AnonymousId,
  CartId,
  LineItemId,
  ProductId,
  Sku,
  VariantId,
} from "../../domain/cart";
import {
  type CheckoutDetails,
  CheckoutLocale,
  CheckoutMutationProviderFailure,
  CheckoutMutationSchemaFailure,
  CheckoutMutationSourceUnavailable,
  CheckoutState,
  CheckoutUnavailable,
  CheckoutVersionConflict,
  CountryCode,
  CountryCodeFromString,
  StorefrontAnonymousCheckoutScope,
} from "../../domain/checkout";
import { CheckoutSession } from "./checkout-session";

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

const scope = new StorefrontAnonymousCheckoutScope({
  channel: "storefrontAnonymous",
  locale: CheckoutLocale.make("en-US"),
  anonymousCartId: CartId.make("cart-1"),
});

const layerWith = (
  input: {
    readonly currentCart?: ReturnType<typeof cart> | undefined;
    readonly details?: CheckoutDetails;
    readonly cartPolicyViolations?: Parameters<
      typeof CheckoutSession.layerMemoryFrom
    >[0]["cartPolicyViolations"];
    readonly manualContactAllowed?: boolean;
    readonly checkoutPolicyViolations?: Parameters<
      typeof CheckoutSession.layerMemoryFrom
    >[0]["checkoutPolicyViolations"];
    readonly saveDeliveryDetailsFailure?: Parameters<
      typeof CheckoutSession.layerMemoryFrom
    >[0]["saveDeliveryDetailsFailure"];
  } = {}
) => {
  const {
    details = {},
    cartPolicyViolations = [],
    manualContactAllowed = true,
    checkoutPolicyViolations = [],
    saveDeliveryDetailsFailure,
  } = input;
  const currentCart = "currentCart" in input ? input.currentCart : cart();

  return CheckoutSession.layerMemoryFrom({
    ...(currentCart === undefined ? {} : { currentCart }),
    details,
    cartPolicyViolations,
    checkoutPolicyViolations,
    ...(saveDeliveryDetailsFailure === undefined
      ? {}
      : { saveDeliveryDetailsFailure }),
    allowedContactSources: manualContactAllowed
      ? ["manual", "customerProfile"]
      : ["customerProfile"],
  });
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

const manualDeliveryDetails = {
  source: "manual",
  shippingAddress: {
    addressLine1: "123 Analytical Engine Way",
    addressLine2: "Suite 42",
    postalCode: "SW1A 1AA",
    city: "London",
    country: CountryCode.make("GB"),
    region: "Greater London",
  },
} as const;

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
          Effect.provide(CheckoutSession.layerMemoryFrom({})),
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
            message: "Guest carts are limited to 50 total items.",
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

  it.effect("reports a version conflict for stale Cart references", () =>
    Effect.gen(function* () {
      const error = yield* CheckoutSession.saveContact({
        scope,
        cart: { id: CartId.make("cart-1"), version: 6 },
        contact: manualContact,
      }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(CheckoutVersionConflict);
      if (error._tag === "CheckoutVersionConflict") {
        expect(error.cartId).toBe("cart-1");
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
          scope,
          cart: { id: CartId.make("cart-1"), version: 7 },
          deliveryDetails: manualDeliveryDetails,
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
          scope,
          cart: { id: CartId.make("cart-1"), version: 7 },
          deliveryDetails: manualDeliveryDetails,
        });
        const firstState = yield* CheckoutSession.getCurrent(scope);

        yield* CheckoutSession.saveDeliveryDetails({
          scope,
          cart: {
            id: firstState.cart.id,
            version: firstState.cart.version,
          },
          deliveryDetails: manualDeliveryDetails,
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

  it.effect("rejects invalid Manual Shipping Address input", () =>
    Effect.gen(function* () {
      const error = yield* CheckoutSession.saveDeliveryDetails({
        scope,
        cart: { id: CartId.make("cart-1"), version: 7 },
        deliveryDetails: {
          ...manualDeliveryDetails,
          shippingAddress: {
            ...manualDeliveryDetails.shippingAddress,
            postalCode: " ",
          },
        },
      }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(CheckoutMutationSchemaFailure);
      expect(error.message).toContain("postalCode");
    }).pipe(Effect.provide(layerWith()))
  );

  it.effect("rejects unsupported Address Book Delivery Details", () =>
    Effect.gen(function* () {
      const error = yield* CheckoutSession.saveDeliveryDetails({
        scope,
        cart: { id: CartId.make("cart-1"), version: 7 },
        deliveryDetails: {
          ...manualDeliveryDetails,
          source: "addressBook",
        },
      }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(CheckoutMutationSourceUnavailable);
      if (error._tag === "CheckoutMutationSourceUnavailable") {
        expect(error.source).toBe("addressBook");
      }
    }).pipe(Effect.provide(layerWith()))
  );

  it.effect("reports provider failures as Checkout Mutation Failures", () =>
    Effect.gen(function* () {
      const error = yield* CheckoutSession.saveDeliveryDetails({
        scope,
        cart: { id: CartId.make("cart-1"), version: 7 },
        deliveryDetails: manualDeliveryDetails,
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

  it.effect("reports a version conflict for stale Cart references", () =>
    Effect.gen(function* () {
      const error = yield* CheckoutSession.saveDeliveryDetails({
        scope,
        cart: { id: CartId.make("cart-1"), version: 6 },
        deliveryDetails: manualDeliveryDetails,
      }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(CheckoutVersionConflict);
      expect(error.message).toContain("Delivery Details");
    }).pipe(Effect.provide(layerWith()))
  );

  it.effect(
    "saves a structurally valid address even when Checkout Policy reports a violation",
    () =>
      Effect.gen(function* () {
        yield* CheckoutSession.saveDeliveryDetails({
          scope,
          cart: { id: CartId.make("cart-1"), version: 7 },
          deliveryDetails: manualDeliveryDetails,
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
            checkoutPolicyViolations: [
              {
                code: "shipping.region.unsupported",
                message: "This Cart cannot ship to the selected region.",
                targets: [{ type: "checkoutStep", step: "shippingOptions" }],
              },
            ],
          })
        )
      )
  );
});
