import { Context, Effect, Layer, Option, Ref } from "effect";
import {
  CartId,
  LineItemId,
  type PositiveCartQuantity,
  type ProductId,
  type VariantId,
} from "../domain/cart";
import {
  CartAccessDenied,
  CartLineItemNotFound,
  CartMerchandiseUnavailable,
  CartNotFound,
  type CartProviderFailure,
  type CartWriteConflict,
  type CartWriteOutcomeUnknown,
} from "../domain/cart-errors";
import type {
  CartProductVariant,
  CartSnapshot,
  CartTarget,
} from "../domain/cart-snapshot";
import type {
  CheckoutContact,
  CheckoutDeliveryDetails,
} from "../domain/checkout";
import type {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "../domain/commerce-account";
import type { Store } from "../store";

export interface FindCartById {
  readonly id: CartId;
  readonly store: Store;
}

export interface FindActiveCartsForBusinessUnit {
  readonly businessUnitId: CommerceBusinessUnitId;
  readonly businessUnitKey: CommerceBusinessUnitKey;
  readonly customerId: CommerceCustomerId;
  readonly store: Store;
}

export interface CreateAnonymousCart {
  readonly store: Store;
}

export interface CreateBusinessUnitCart
  extends FindActiveCartsForBusinessUnit {}

export interface AddCartItem {
  readonly productId: ProductId;
  readonly quantity: PositiveCartQuantity;
  readonly target: CartTarget;
  readonly variantId: VariantId;
}

export interface SetCartLineItemQuantity {
  readonly lineItemId: LineItemId;
  readonly quantity: PositiveCartQuantity;
  readonly target: CartTarget;
}

export interface RemoveCartLineItem {
  readonly lineItemId: LineItemId;
  readonly target: CartTarget;
}

export interface SaveCartContact {
  readonly contact: CheckoutContact;
  readonly target: CartTarget;
}

export interface SaveCartDeliveryDetails {
  readonly deliveryDetails: CheckoutDeliveryDetails;
  readonly target: CartTarget;
}

export type FindCartFailure = CartAccessDenied | CartProviderFailure;
export type FindCartsFailure = CartAccessDenied | CartProviderFailure;
export type CreateCartFailure =
  | CartAccessDenied
  | CartProviderFailure
  | CartWriteOutcomeUnknown;
export type AddCartItemFailure =
  | CartNotFound
  | CartMerchandiseUnavailable
  | CartAccessDenied
  | CartWriteConflict
  | CartWriteOutcomeUnknown
  | CartProviderFailure;
export type SetCartLineItemQuantityFailure =
  | CartNotFound
  | CartLineItemNotFound
  | CartAccessDenied
  | CartWriteConflict
  | CartWriteOutcomeUnknown
  | CartProviderFailure;
export type RemoveCartLineItemFailure = SetCartLineItemQuantityFailure;
export type SaveCartDetailsFailure =
  | CartNotFound
  | CartAccessDenied
  | CartWriteConflict
  | CartWriteOutcomeUnknown
  | CartProviderFailure;

export interface CartsMemoryMerchandise {
  readonly unitPrice: CartSnapshot["totalPrice"];
  readonly variant: CartProductVariant;
}

export interface CartsMemorySeed {
  readonly carts?: readonly CartSnapshot[];
  readonly failures?: {
    readonly findById?: FindCartFailure;
    readonly findActiveForBusinessUnit?: FindCartsFailure;
    readonly createAnonymous?: CreateCartFailure;
    readonly createForBusinessUnit?: CreateCartFailure;
    readonly addItem?: AddCartItemFailure;
    readonly setLineItemQuantity?: SetCartLineItemQuantityFailure;
    readonly removeLineItem?: RemoveCartLineItemFailure;
    readonly saveContact?: SaveCartDetailsFailure;
    readonly saveDeliveryDetails?: SaveCartDetailsFailure;
  };
  readonly merchandise?: readonly CartsMemoryMerchandise[];
}

const emptyCart = (
  id: CartId,
  store: Store,
  businessUnitId?: CommerceBusinessUnitId
): CartSnapshot => ({
  id,
  status: "active",
  storeKey: store.storeKey,
  ...(businessUnitId === undefined
    ? {}
    : { buyingContext: { businessUnitId } }),
  checkoutDetails: {},
  lineItems: [],
  totalLineItemQuantity: 0,
  totalPrice: {
    centAmount: 0,
    currencyCode: store.currency,
  },
});

export class Carts extends Context.Service<
  Carts,
  {
    readonly findById: (
      input: FindCartById
    ) => Effect.Effect<Option.Option<CartSnapshot>, FindCartFailure>;
    readonly findActiveForBusinessUnit: (
      input: FindActiveCartsForBusinessUnit
    ) => Effect.Effect<readonly CartSnapshot[], FindCartsFailure>;
    readonly createAnonymous: (
      input: CreateAnonymousCart
    ) => Effect.Effect<CartSnapshot, CreateCartFailure>;
    readonly createForBusinessUnit: (
      input: CreateBusinessUnitCart
    ) => Effect.Effect<CartSnapshot, CreateCartFailure>;
    readonly addItem: (
      input: AddCartItem
    ) => Effect.Effect<CartSnapshot, AddCartItemFailure>;
    readonly setLineItemQuantity: (
      input: SetCartLineItemQuantity
    ) => Effect.Effect<CartSnapshot, SetCartLineItemQuantityFailure>;
    readonly removeLineItem: (
      input: RemoveCartLineItem
    ) => Effect.Effect<CartSnapshot, RemoveCartLineItemFailure>;
    readonly saveContact: (
      input: SaveCartContact
    ) => Effect.Effect<CartSnapshot, SaveCartDetailsFailure>;
    readonly saveDeliveryDetails: (
      input: SaveCartDeliveryDetails
    ) => Effect.Effect<CartSnapshot, SaveCartDetailsFailure>;
  }
>()("@repo/commerce/Carts") {
  static readonly layerMemory = (seed: CartsMemorySeed = {}) =>
    Layer.effect(
      Carts,
      Effect.gen(function* () {
        const state = yield* Ref.make(
          new Map((seed.carts ?? []).map((cart) => [cart.id, cart]))
        );
        let nextId = (seed.carts?.length ?? 0) + 1;

        const failIfConfigured = <E>(failure: E | undefined) =>
          failure === undefined ? Effect.void : Effect.fail(failure);

        const findById = Effect.fn("Carts.findById")(
          ({ id, store }: FindCartById) =>
            Effect.gen(function* () {
              yield* failIfConfigured(seed.failures?.findById);
              const carts = yield* Ref.get(state);
              const cart = carts.get(id);
              return cart?.storeKey === store.storeKey
                ? Option.some(cart)
                : Option.none<CartSnapshot>();
            })
        );

        const createAnonymous = Effect.fn("Carts.createAnonymous")(
          ({ store }: CreateAnonymousCart) =>
            Effect.gen(function* () {
              yield* failIfConfigured(seed.failures?.createAnonymous);
              const cart = emptyCart(CartId.make(`cart-${nextId}`), store);
              nextId += 1;
              yield* Ref.update(state, (carts) =>
                new Map(carts).set(cart.id, cart)
              );
              return cart;
            })
        );

        const findActiveForBusinessUnit = Effect.fn(
          "Carts.findActiveForBusinessUnit"
        )((input: FindActiveCartsForBusinessUnit) =>
          Effect.gen(function* () {
            yield* failIfConfigured(seed.failures?.findActiveForBusinessUnit);
            const carts = yield* Ref.get(state);
            return [...carts.values()].filter(
              (cart) =>
                cart.status === "active" &&
                cart.storeKey === input.store.storeKey &&
                cart.buyingContext?.businessUnitId === input.businessUnitId
            );
          })
        );

        const createForBusinessUnit = Effect.fn("Carts.createForBusinessUnit")(
          (input: CreateBusinessUnitCart) =>
            Effect.gen(function* () {
              yield* failIfConfigured(seed.failures?.createForBusinessUnit);
              const cart = emptyCart(
                CartId.make(`cart-${nextId}`),
                input.store,
                input.businessUnitId
              );
              nextId += 1;
              yield* Ref.update(state, (carts) =>
                new Map(carts).set(cart.id, cart)
              );
              return cart;
            })
        );

        const getTargetCart = (
          target: CartTarget,
          operation:
            | "addItem"
            | "setLineItemQuantity"
            | "removeLineItem"
            | "saveContact"
            | "saveDeliveryDetails"
        ) =>
          Effect.gen(function* () {
            const carts = yield* Ref.get(state);
            const cart = carts.get(target.id);

            if (cart === undefined) {
              return yield* new CartNotFound({
                cartId: target.id,
                operation,
              });
            }

            const wrongStore = cart.storeKey !== target.store.storeKey;
            const wrongBuyingContext =
              target._tag === "AnonymousCartTarget"
                ? cart.buyingContext !== undefined
                : cart.buyingContext?.businessUnitId !== target.businessUnitId;

            if (wrongStore || wrongBuyingContext) {
              return yield* new CartAccessDenied({
                cartId: target.id,
                operation,
              });
            }

            return cart;
          });

        const saveCart = (cart: CartSnapshot) =>
          Ref.update(state, (carts) => new Map(carts).set(cart.id, cart));

        const withLineItems = (
          cart: CartSnapshot,
          lineItems: CartSnapshot["lineItems"]
        ): CartSnapshot => ({
          ...cart,
          lineItems,
          totalLineItemQuantity: lineItems.reduce(
            (total, lineItem) => total + lineItem.quantity,
            0
          ),
          totalPrice: {
            centAmount: lineItems.reduce(
              (total, lineItem) =>
                total + (lineItem.totalPrice?.centAmount ?? 0),
              0
            ),
            currencyCode: cart.totalPrice.currencyCode,
          },
        });

        const addItem = Effect.fn("Carts.addItem")((input: AddCartItem) =>
          Effect.gen(function* () {
            yield* failIfConfigured(seed.failures?.addItem);
            const cart = yield* getTargetCart(input.target, "addItem");
            const merchandise = seed.merchandise?.find(
              (candidate) =>
                candidate.variant.productId === input.productId &&
                candidate.variant.id === input.variantId
            );

            if (merchandise === undefined) {
              return yield* new CartMerchandiseUnavailable({
                productId: input.productId,
                variantId: input.variantId,
              });
            }

            const existing = cart.lineItems.find(
              (lineItem) =>
                lineItem.variant.productId === input.productId &&
                lineItem.variant.id === input.variantId
            );
            const quantity = (existing?.quantity ?? 0) + input.quantity;
            const updatedLine = {
              id:
                existing?.id ??
                LineItemId.make(`line-${cart.lineItems.length + 1}`),
              quantity,
              totalPrice: {
                centAmount: merchandise.unitPrice.centAmount * quantity,
                currencyCode: merchandise.unitPrice.currencyCode,
              },
              unitPrice: merchandise.unitPrice,
              variant: merchandise.variant,
            };
            const lineItems = existing
              ? cart.lineItems.map((lineItem) =>
                  lineItem.id === existing.id ? updatedLine : lineItem
                )
              : [...cart.lineItems, updatedLine];
            const updated = withLineItems(cart, lineItems);

            yield* saveCart(updated);
            return updated;
          })
        );

        const setLineItemQuantity = Effect.fn("Carts.setLineItemQuantity")(
          (input: SetCartLineItemQuantity) =>
            Effect.gen(function* () {
              yield* failIfConfigured(seed.failures?.setLineItemQuantity);
              const cart = yield* getTargetCart(
                input.target,
                "setLineItemQuantity"
              );
              const selected = cart.lineItems.find(
                (lineItem) => lineItem.id === input.lineItemId
              );

              if (selected === undefined) {
                return yield* new CartLineItemNotFound({
                  cartId: cart.id,
                  lineItemId: input.lineItemId,
                  operation: "setLineItemQuantity",
                });
              }

              const lineItems = cart.lineItems.map((lineItem) =>
                lineItem.id === input.lineItemId
                  ? {
                      ...lineItem,
                      quantity: input.quantity,
                      totalPrice: {
                        centAmount:
                          lineItem.unitPrice.centAmount * input.quantity,
                        currencyCode: lineItem.unitPrice.currencyCode,
                      },
                    }
                  : lineItem
              );
              const updated = withLineItems(cart, lineItems);
              yield* saveCart(updated);
              return updated;
            })
        );

        const removeLineItem = Effect.fn("Carts.removeLineItem")(
          (input: RemoveCartLineItem) =>
            Effect.gen(function* () {
              yield* failIfConfigured(seed.failures?.removeLineItem);
              const cart = yield* getTargetCart(input.target, "removeLineItem");
              const selected = cart.lineItems.find(
                (lineItem) => lineItem.id === input.lineItemId
              );

              if (selected === undefined) {
                return yield* new CartLineItemNotFound({
                  cartId: cart.id,
                  lineItemId: input.lineItemId,
                  operation: "removeLineItem",
                });
              }

              const updated = withLineItems(
                cart,
                cart.lineItems.filter(
                  (lineItem) => lineItem.id !== input.lineItemId
                )
              );
              yield* saveCart(updated);
              return updated;
            })
        );

        const saveContact = Effect.fn("Carts.saveContact")(
          (input: SaveCartContact) =>
            Effect.gen(function* () {
              yield* failIfConfigured(seed.failures?.saveContact);
              const cart = yield* getTargetCart(input.target, "saveContact");
              const updated = {
                ...cart,
                checkoutDetails: {
                  ...cart.checkoutDetails,
                  contact: input.contact,
                },
              } satisfies CartSnapshot;
              yield* saveCart(updated);
              return updated;
            })
        );

        const saveDeliveryDetails = Effect.fn("Carts.saveDeliveryDetails")(
          (input: SaveCartDeliveryDetails) =>
            Effect.gen(function* () {
              yield* failIfConfigured(seed.failures?.saveDeliveryDetails);
              const cart = yield* getTargetCart(
                input.target,
                "saveDeliveryDetails"
              );
              const updated = {
                ...cart,
                checkoutDetails: {
                  ...cart.checkoutDetails,
                  deliveryDetails: input.deliveryDetails,
                },
              } satisfies CartSnapshot;
              yield* saveCart(updated);
              return updated;
            })
        );

        return Carts.of({
          addItem,
          createAnonymous,
          createForBusinessUnit,
          findActiveForBusinessUnit,
          findById,
          removeLineItem,
          saveContact,
          saveDeliveryDetails,
          setLineItemQuantity,
        });
      })
    );
}
