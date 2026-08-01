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
  type CurrentCartAssociationFailure,
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
import type { CurrentCartRequest } from "../lib/current-cart/request";
import { CartPolicies } from "./cart-policies";
import { Carts } from "./carts";

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
  | CurrentCartAssociationFailure
  | CartProviderFailure
  | CartPolicyFailure;

export type AddCurrentCartItemFailure =
  | CurrentCartSelectionConflict
  | CurrentCartUnavailable
  | CartMerchandiseUnavailable
  | CartWriteConflict
  | CartWriteOutcomeUnknown
  | CurrentCartAssociationFailure
  | CartProviderFailure
  | CartPolicyFailure;

export type SetCurrentCartLineItemQuantityFailure =
  | CurrentCartSelectionConflict
  | CurrentCartAssociationFailure
  | CurrentCartUnavailable
  | CartLineItemNotFound
  | CartWriteConflict
  | CartProviderFailure
  | CartPolicyFailure;

export type RemoveCurrentCartLineItemFailure =
  SetCurrentCartLineItemQuantityFailure;

export type SaveCurrentCartDetailsFailure =
  | CurrentCartSelectionConflict
  | CurrentCartAssociationFailure
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
  static readonly layer = (request: CurrentCartRequest) =>
    Layer.effect(
      CurrentCart,
      Effect.gen(function* () {
        const carts = yield* Carts;
        const policies = yield* CartPolicies;
        type SelectedCart = {
          readonly cart: CartSnapshot;
          readonly target: CartTarget;
        };
        const selection = yield* Ref.make<
          Option.Option<SelectedCart> | undefined
        >(undefined);

        const targetFor = (cart: CartSnapshot): CartTarget =>
          request._tag === "AnonymousCurrentCartRequest"
            ? {
                _tag: "AnonymousCartTarget",
                id: cart.id,
                store: request.store,
              }
            : {
                _tag: "BusinessUnitCartTarget",
                id: cart.id,
                store: request.store,
                customerId: request.customerId,
                businessUnitId: request.businessUnitId,
                businessUnitKey: request.businessUnitKey,
              };

        const cacheSelection = (cart: CartSnapshot) => {
          const selected = { cart, target: targetFor(cart) };
          return Ref.set(selection, Option.some(selected)).pipe(
            Effect.as(selected)
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

        const resolveSelection = Effect.fn("CurrentCart.resolveSelection")(() =>
          Effect.gen(function* () {
            const cached = yield* Ref.get(selection);
            if (cached !== undefined) {
              return cached;
            }

            if (request._tag === "AnonymousCurrentCartRequest") {
              if (request.possessedCartId === undefined) {
                const absent = Option.none<SelectedCart>();
                yield* Ref.set(selection, absent);
                return absent;
              }

              const found = yield* carts
                .findById({
                  id: request.possessedCartId,
                  store: request.store,
                })
                .pipe(
                  Effect.catchTag("CartAccessDenied", (error) =>
                    providerFailureFromAccess(error)
                  )
                );
              if (Option.isNone(found)) {
                yield* request.clear();
                const absent = Option.none<SelectedCart>();
                yield* Ref.set(selection, absent);
                return absent;
              }

              const cart = found.value;
              if (
                cart.status !== "active" ||
                cart.storeKey !== request.store.storeKey
              ) {
                yield* request.clear();
                const absent = Option.none<SelectedCart>();
                yield* Ref.set(selection, absent);
                return absent;
              }

              return Option.some(yield* cacheSelection(cart));
            }

            const candidates = yield* carts
              .findActiveForBusinessUnit({
                store: request.store,
                customerId: request.customerId,
                businessUnitId: request.businessUnitId,
                businessUnitKey: request.businessUnitKey,
              })
              .pipe(
                Effect.catchTag("CartAccessDenied", (error) =>
                  providerFailureFromAccess(error)
                )
              );
            if (candidates.length > 1) {
              return yield* new CurrentCartSelectionConflict({
                businessUnitId: request.businessUnitId,
                cartIds: candidates.map((candidate) => candidate.id),
              });
            }
            const cart = candidates[0];
            if (cart === undefined) {
              const absent = Option.none<SelectedCart>();
              yield* Ref.set(selection, absent);
              return absent;
            }
            return Option.some(yield* cacheSelection(cart));
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

        const requireSelection = Effect.fn("CurrentCart.requireSelection")(() =>
          resolveSelection().pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => new CurrentCartUnavailable({ reason: "noCart" }),
                onSome: Effect.succeed,
              })
            )
          )
        );

        const createSelection = Effect.fn("CurrentCart.createSelection")(() =>
          Effect.gen(function* () {
            const cart =
              request._tag === "AnonymousCurrentCartRequest"
                ? yield* carts.createAnonymous({ store: request.store })
                : yield* carts.createForBusinessUnit({
                    store: request.store,
                    customerId: request.customerId,
                    businessUnitId: request.businessUnitId,
                    businessUnitKey: request.businessUnitKey,
                  });
            if (request._tag === "AnonymousCurrentCartRequest") {
              yield* request.establish(cart.id);
            }
            return yield* cacheSelection(cart);
          }).pipe(
            Effect.catchTag(
              "CartAccessDenied",
              () => new CurrentCartUnavailable({ reason: "inaccessibleCart" })
            )
          )
        );

        const replaceAndEvaluate = (
          selected: SelectedCart,
          cart: CartSnapshot
        ) =>
          Ref.set(selection, Option.some({ ...selected, cart })).pipe(
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
            resolveSelection().pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () => Effect.succeed(Option.none<CurrentCartState>()),
                  onSome: ({ cart }) =>
                    request._tag === "AnonymousCurrentCartRequest" &&
                    cart.buyingContext !== undefined
                      ? Effect.succeed(Option.none<CurrentCartState>())
                      : evaluate(cart).pipe(Effect.map(Option.some)),
                })
              )
            ),
          addItem: (input) =>
            Effect.gen(function* () {
              const existing = yield* resolveSelection();
              const selected = Option.isSome(existing)
                ? existing.value
                : yield* createSelection();
              const cart = yield* mapUnavailable(
                carts.addItem({ ...input, target: selected.target })
              );
              return yield* replaceAndEvaluate(selected, cart);
            }),
          setLineItemQuantity: (input) =>
            Effect.gen(function* () {
              const selected = yield* requireSelection();
              const cart = yield* mapUnavailable(
                carts.setLineItemQuantity({
                  ...input,
                  target: selected.target,
                })
              );
              return yield* replaceAndEvaluate(selected, cart);
            }),
          removeLineItem: (input) =>
            Effect.gen(function* () {
              const selected = yield* requireSelection();
              const cart = yield* mapUnavailable(
                carts.removeLineItem({ ...input, target: selected.target })
              );
              return yield* replaceAndEvaluate(selected, cart);
            }),
          saveContact: (contact) =>
            Effect.gen(function* () {
              const selected = yield* requireSelection();
              const cart = yield* mapUnavailable(
                carts.saveContact({ target: selected.target, contact })
              );
              return yield* replaceAndEvaluate(selected, cart);
            }),
          saveDeliveryDetails: (deliveryDetails) =>
            Effect.gen(function* () {
              const selected = yield* requireSelection();
              if (
                JSON.stringify(
                  selected.cart.checkoutDetails.deliveryDetails
                ) === JSON.stringify(deliveryDetails)
              ) {
                return yield* evaluate(selected.cart);
              }
              const cart = yield* mapUnavailable(
                carts.saveDeliveryDetails({
                  target: selected.target,
                  deliveryDetails,
                })
              );
              return yield* replaceAndEvaluate(selected, cart);
            }),
        });
      })
    );
}
