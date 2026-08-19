import { Context, Effect, Layer, Option, Ref } from "effect";

import type {
  LineItemId,
  PositiveCartQuantity,
  ProductId,
  VariantId,
} from "../domain/cart";
import {
  CartProviderFailure,
  CurrentCartSelectionConflict,
  CurrentCartUnavailable,
} from "../domain/cart-errors";
import type {
  CartLineItemNotFound,
  CartMerchandiseUnavailable,
  CartOperation,
  CartPolicyFailure,
  CartWriteConflict,
  CartWriteOutcomeUnknown,
  CurrentCartOperationFailure,
} from "../domain/cart-errors";
import type {
  CartSnapshot,
  CartTarget,
  CurrentCartState,
} from "../domain/cart-snapshot";
import type {
  CheckoutContact,
  CheckoutDeliveryDetails,
} from "../domain/checkout";
import {
  AnonymousCommercePrincipal,
  CustomerCommercePrincipal,
} from "../domain/commerce-request-context";
import type { CurrentCartCookie } from "../lib/current-cart/cookie";
import { CartPolicies } from "./cart-policies";
import { Carts } from "./carts";
import { CommerceContext } from "./commerce-context";

export interface AddCurrentCartItem {
  readonly productId: ProductId;
  readonly quantity: PositiveCartQuantity;
  readonly variantId: VariantId;
}

export interface SetCurrentCartLineItemQuantity {
  readonly lineItemId: LineItemId;
  readonly quantity: PositiveCartQuantity;
}

export interface RemoveCurrentCartLineItem {
  readonly lineItemId: LineItemId;
}

export type CurrentCartReadFailure =
  | CurrentCartSelectionConflict
  | CartProviderFailure
  | CartPolicyFailure;

export type AddCurrentCartItemFailure =
  | CurrentCartSelectionConflict
  | CurrentCartUnavailable
  | CartMerchandiseUnavailable
  | CartWriteConflict
  | CartWriteOutcomeUnknown
  | CurrentCartOperationFailure
  | CartProviderFailure
  | CartPolicyFailure;

export type SetCurrentCartLineItemQuantityFailure =
  | CurrentCartSelectionConflict
  | CurrentCartUnavailable
  | CartLineItemNotFound
  | CartWriteConflict
  | CartWriteOutcomeUnknown
  | CartProviderFailure
  | CartPolicyFailure;

export type RemoveCurrentCartLineItemFailure =
  SetCurrentCartLineItemQuantityFailure;

export type SaveCurrentCartDetailsFailure =
  | CurrentCartSelectionConflict
  | CurrentCartUnavailable
  | CartWriteConflict
  | CartWriteOutcomeUnknown
  | CartProviderFailure
  | CartPolicyFailure;

export class CurrentCart extends Context.Service<
  CurrentCart,
  {
    readonly get: () => Effect.Effect<
      Option.Option<CurrentCartState>,
      CurrentCartReadFailure
    >;
    readonly addItem: (
      input: AddCurrentCartItem
    ) => Effect.Effect<CurrentCartState, AddCurrentCartItemFailure>;
    readonly setLineItemQuantity: (
      input: SetCurrentCartLineItemQuantity
    ) => Effect.Effect<CurrentCartState, SetCurrentCartLineItemQuantityFailure>;
    readonly removeLineItem: (
      input: RemoveCurrentCartLineItem
    ) => Effect.Effect<CurrentCartState, RemoveCurrentCartLineItemFailure>;
    readonly saveContact: (
      contact: CheckoutContact
    ) => Effect.Effect<CurrentCartState, SaveCurrentCartDetailsFailure>;
    readonly saveDeliveryDetails: (
      details: CheckoutDeliveryDetails
    ) => Effect.Effect<CurrentCartState, SaveCurrentCartDetailsFailure>;
  }
>()("@repo/commerce/CurrentCart") {
  static readonly get = Effect.fn("CurrentCart.get")(() =>
    Effect.flatMap(CurrentCart, (currentCart) => currentCart.get())
  );

  static readonly addItem = Effect.fn("CurrentCart.addItem")(
    (input: AddCurrentCartItem) =>
      Effect.flatMap(CurrentCart, (currentCart) => currentCart.addItem(input))
  );

  static readonly setLineItemQuantity = Effect.fn(
    "CurrentCart.setLineItemQuantity"
  )((input: SetCurrentCartLineItemQuantity) =>
    Effect.flatMap(CurrentCart, (currentCart) =>
      currentCart.setLineItemQuantity(input)
    )
  );

  static readonly removeLineItem = Effect.fn("CurrentCart.removeLineItem")(
    (input: RemoveCurrentCartLineItem) =>
      Effect.flatMap(CurrentCart, (currentCart) =>
        currentCart.removeLineItem(input)
      )
  );

  static readonly saveContact = Effect.fn("CurrentCart.saveContact")(
    (contact: CheckoutContact) =>
      Effect.flatMap(CurrentCart, (currentCart) =>
        currentCart.saveContact(contact)
      )
  );

  static readonly saveDeliveryDetails = Effect.fn(
    "CurrentCart.saveDeliveryDetails"
  )((details: CheckoutDeliveryDetails) =>
    Effect.flatMap(CurrentCart, (currentCart) =>
      currentCart.saveDeliveryDetails(details)
    )
  );

  static readonly layer = (cookie: CurrentCartCookie) =>
    Layer.effect(
      CurrentCart,
      Effect.gen(function* () {
        const carts = yield* Carts;
        const policies = yield* CartPolicies;
        const commerceContext = yield* CommerceContext;
        const { principal, store } = commerceContext;
        const isAnonymous = principal instanceof AnonymousCommercePrincipal;
        if (!(isAnonymous || principal instanceof CustomerCommercePrincipal)) {
          return yield* Effect.die(principal satisfies never);
        }
        type ResolvedCart = {
          readonly cart: CartSnapshot;
          readonly target: CartTarget;
        };
        const resolvedCart = yield* Ref.make<
          Option.Option<ResolvedCart> | undefined
        >(undefined);

        const targetFor = (cart: CartSnapshot): CartTarget =>
          isAnonymous
            ? {
                _tag: "AnonymousCartTarget",
                id: cart.id,
                store,
              }
            : {
                _tag: "BusinessUnitCartTarget",
                businessUnitId: principal.businessUnitId,
                businessUnitKey: principal.businessUnitKey,
                customerId: principal.customerId,
                id: cart.id,
                store,
              };

        const setResolvedCart = (cart: CartSnapshot) => {
          const resolved = { cart, target: targetFor(cart) };
          return Ref.set(resolvedCart, Option.some(resolved)).pipe(
            Effect.as(resolved)
          );
        };

        const providerFailureFromAccess = (error: {
          readonly operation: CartOperation;
        }) =>
          new CartProviderFailure({
            cause: error,
            operation: error.operation,
            reason: "unexpectedResponse",
          });

        const resolveCart = Effect.fn("CurrentCart.resolveCart")(() =>
          Effect.gen(function* () {
            const cached = yield* Ref.get(resolvedCart);
            if (cached !== undefined) {
              return cached;
            }

            if (isAnonymous) {
              if (principal.anonymousCartId === undefined) {
                const absent = Option.none<ResolvedCart>();
                yield* Ref.set(resolvedCart, absent);
                return absent;
              }

              const found = yield* carts
                .findById({
                  id: principal.anonymousCartId,
                  store,
                })
                .pipe(
                  Effect.catchTag("CartAccessDenied", (error) =>
                    providerFailureFromAccess(error)
                  )
                );
              if (Option.isNone(found)) {
                yield* cookie.clear();
                const absent = Option.none<ResolvedCart>();
                yield* Ref.set(resolvedCart, absent);
                return absent;
              }

              const cart = found.value;
              if (
                cart.status !== "active" ||
                cart.storeKey !== store.storeKey
              ) {
                yield* cookie.clear();
                const absent = Option.none<ResolvedCart>();
                yield* Ref.set(resolvedCart, absent);
                return absent;
              }
              if (cart.buyingContext !== undefined) {
                return yield* new CartProviderFailure({
                  operation: "findById",
                  reason: "unexpectedResponse",
                });
              }

              return Option.some(yield* setResolvedCart(cart));
            }

            const candidates = yield* carts
              .findActiveForBusinessUnit({
                businessUnitId: principal.businessUnitId,
                businessUnitKey: principal.businessUnitKey,
                customerId: principal.customerId,
                store,
              })
              .pipe(
                Effect.catchTag("CartAccessDenied", (error) =>
                  providerFailureFromAccess(error)
                )
              );
            if (candidates.length > 1) {
              return yield* new CurrentCartSelectionConflict({
                businessUnitId: principal.businessUnitId,
                cartIds: candidates.map((candidate) => candidate.id),
              });
            }
            const [cart] = candidates;
            if (cart === undefined) {
              const absent = Option.none<ResolvedCart>();
              yield* Ref.set(resolvedCart, absent);
              return absent;
            }
            return Option.some(yield* setResolvedCart(cart));
          })
        );

        const evaluate = Effect.fn("CurrentCart.evaluate")(
          (cart: CartSnapshot) =>
            policies
              .evaluate(cart)
              .pipe(
                Effect.map(
                  (violations): CurrentCartState => ({ cart, violations })
                )
              )
        );

        const requireResolvedCart = Effect.fn(
          "CurrentCart.requireResolvedCart"
        )(() =>
          resolveCart().pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => new CurrentCartUnavailable({ reason: "noCart" }),
                onSome: Effect.succeed,
              })
            )
          )
        );

        const createAndResolveCart = Effect.fn(
          "CurrentCart.createAndResolveCart"
        )(() =>
          Effect.gen(function* () {
            const cart = isAnonymous
              ? yield* carts.createAnonymous({ store })
              : yield* carts.createForBusinessUnit({
                  businessUnitId: principal.businessUnitId,
                  businessUnitKey: principal.businessUnitKey,
                  customerId: principal.customerId,
                  store,
                });
            if (isAnonymous) {
              yield* cookie.set(cart.id);
            }
            return yield* setResolvedCart(cart);
          }).pipe(
            Effect.catchTag(
              "CartAccessDenied",
              () => new CurrentCartUnavailable({ reason: "inaccessibleCart" })
            )
          )
        );

        const replaceAndEvaluate = (
          resolved: ResolvedCart,
          cart: CartSnapshot
        ) =>
          Ref.set(resolvedCart, Option.some({ ...resolved, cart })).pipe(
            Effect.andThen(evaluate(cart))
          );

        const mapUnavailable = <A, E>(
          effect: Effect.Effect<
            A,
            E | { readonly _tag: "CartNotFound" | "CartAccessDenied" }
          >
        ) =>
          effect.pipe(
            Effect.catchTags({
              CartAccessDenied: () =>
                new CurrentCartUnavailable({ reason: "inaccessibleCart" }),
              CartNotFound: () =>
                new CurrentCartUnavailable({ reason: "noCart" }),
            })
          );

        return CurrentCart.of({
          addItem: (input) =>
            Effect.gen(function* () {
              const existing = yield* resolveCart();
              const resolved = Option.isSome(existing)
                ? existing.value
                : yield* createAndResolveCart();
              const cart = yield* mapUnavailable(
                carts.addItem({ ...input, target: resolved.target })
              );
              return yield* replaceAndEvaluate(resolved, cart);
            }),
          get: () =>
            resolveCart().pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () => Effect.succeed(Option.none<CurrentCartState>()),
                  onSome: ({ cart }) =>
                    evaluate(cart).pipe(Effect.map(Option.some)),
                })
              )
            ),
          removeLineItem: (input) =>
            Effect.gen(function* () {
              const resolved = yield* requireResolvedCart();
              const cart = yield* mapUnavailable(
                carts.removeLineItem({ ...input, target: resolved.target })
              );
              return yield* replaceAndEvaluate(resolved, cart);
            }),
          saveContact: (contact) =>
            Effect.gen(function* () {
              const resolved = yield* requireResolvedCart();
              const cart = yield* mapUnavailable(
                carts.saveContact({ contact, target: resolved.target })
              );
              return yield* replaceAndEvaluate(resolved, cart);
            }),
          saveDeliveryDetails: (deliveryDetails) =>
            Effect.gen(function* () {
              const resolved = yield* requireResolvedCart();
              if (
                JSON.stringify(
                  resolved.cart.checkoutDetails.deliveryDetails
                ) === JSON.stringify(deliveryDetails)
              ) {
                return yield* evaluate(resolved.cart);
              }
              const cart = yield* mapUnavailable(
                carts.saveDeliveryDetails({
                  deliveryDetails,
                  target: resolved.target,
                })
              );
              return yield* replaceAndEvaluate(resolved, cart);
            }),
          setLineItemQuantity: (input) =>
            Effect.gen(function* () {
              const resolved = yield* requireResolvedCart();
              const cart = yield* mapUnavailable(
                carts.setLineItemQuantity({
                  ...input,
                  target: resolved.target,
                })
              );
              return yield* replaceAndEvaluate(resolved, cart);
            }),
        });
      })
    );
}
