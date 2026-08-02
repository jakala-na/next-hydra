import { Context, Effect, Layer, Option, Ref } from "effect";
import type {
  LineItemId,
  PositiveCartQuantity,
  ProductId,
  VariantId,
} from "../domain/cart";
import {
  type CartLineItemNotFound,
  type CartMerchandiseUnavailable,
  type CartOperation,
  type CartPolicyFailure,
  CartProviderFailure,
  type CartWriteConflict,
  type CartWriteOutcomeUnknown,
  type CurrentCartOperationFailure,
  CurrentCartSelectionConflict,
  CurrentCartUnavailable,
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
  readonly variantId: VariantId;
  readonly quantity: PositiveCartQuantity;
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
  | CartProviderFailure
  | CartPolicyFailure;

export type RemoveCurrentCartLineItemFailure =
  SetCurrentCartLineItemQuantityFailure;

export type SaveCurrentCartDetailsFailure =
  | CurrentCartSelectionConflict
  | CurrentCartUnavailable
  | CartWriteConflict
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
          principal satisfies never;
          return yield* Effect.die("Unsupported Commerce Principal");
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
                id: cart.id,
                store,
                customerId: principal.customerId,
                businessUnitId: principal.businessUnitId,
                businessUnitKey: principal.businessUnitKey,
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
            operation: error.operation,
            reason: "unexpectedResponse",
            cause: error,
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
                store,
                customerId: principal.customerId,
                businessUnitId: principal.businessUnitId,
                businessUnitKey: principal.businessUnitKey,
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
            const cart = candidates[0];
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
                  store,
                  customerId: principal.customerId,
                  businessUnitId: principal.businessUnitId,
                  businessUnitKey: principal.businessUnitKey,
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
              CartNotFound: () =>
                new CurrentCartUnavailable({ reason: "noCart" }),
              CartAccessDenied: () =>
                new CurrentCartUnavailable({ reason: "inaccessibleCart" }),
            })
          );

        return CurrentCart.of({
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
                carts.saveContact({ target: resolved.target, contact })
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
                  target: resolved.target,
                  deliveryDetails,
                })
              );
              return yield* replaceAndEvaluate(resolved, cart);
            }),
        });
      })
    );
}
