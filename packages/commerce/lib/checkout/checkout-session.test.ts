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
  CheckoutState,
  CheckoutUnavailable,
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

const layerWith = ({
  currentCart = cart(),
  details = {},
  cartPolicyViolations = [],
}: {
  readonly currentCart?: ReturnType<typeof cart>;
  readonly details?: CheckoutDetails;
  readonly cartPolicyViolations?: Parameters<
    typeof CheckoutSession.layerMemoryFrom
  >[0]["cartPolicyViolations"];
} = {}) =>
  CheckoutSession.layerMemoryFrom({
    currentCart,
    details,
    cartPolicyViolations,
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
