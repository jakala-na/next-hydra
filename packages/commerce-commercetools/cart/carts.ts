import {
  CartId,
  LineItemId,
  ProductId,
  Sku,
  VariantId,
} from "@repo/commerce/domain/cart";
import {
  CartAccessDenied,
  CartLineItemNotFound,
  CartMerchandiseUnavailable,
  CartNotFound,
  type CartOperation,
  CartProviderFailure,
  CartWriteConflict,
  CartWriteOutcomeUnknown,
} from "@repo/commerce/domain/cart-errors";
import {
  CartSnapshot,
  type CartTarget,
  type ProductAttributeValue,
} from "@repo/commerce/domain/cart-snapshot";
import {
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "@repo/commerce/domain/checkout";
import type {
  CreateCartFailure,
  FindCartFailure,
  FindCartsFailure,
} from "@repo/commerce/services/carts";
import {
  type AddCartItem,
  Carts,
  type CreateAnonymousCart,
  type CreateBusinessUnitCart,
  type FindActiveCartsForBusinessUnit,
  type FindCartById,
  type RemoveCartLineItem,
  type SaveCartContact,
  type SaveCartDeliveryDetails,
  type SetCartLineItemQuantity,
} from "@repo/commerce/services/carts";
import { StoreKey } from "@repo/commerce/store";
import { Effect, Layer, Option, Schema } from "effect";
import { CommercetoolsGraphQLClient } from "../client/graphql-client";
import { commercetoolsClientsLayer } from "../client/layers";
import { CommercetoolsRestClient } from "../client/rest-client";
import {
  hasPersistedCheckoutContact,
  ORDER_CUSTOM_TYPE_KEY,
} from "./contact-actions";
import { makeCartPersistence } from "./persistence";
import type {
  CommercetoolsCartAccessDenied,
  CommercetoolsCartCustomTypeConflict,
  CommercetoolsCartMerchandiseUnavailable,
  CommercetoolsCartNotFound,
  CommercetoolsCartVersionConflict,
  CommercetoolsCartWriteOutcomeUnknown,
  CommercetoolsUnavailable,
} from "./persistence-errors";
import type {
  AddToCartRepoParams,
  ChangeItemQuantityParams,
  CreateBusinessUnitCartRepoParams,
  CreateCartRepoParams,
  GetActiveCartForAssociateScopeParams,
  RemoveItemFromCartParams,
  SaveCheckoutContactParams,
  SaveCheckoutDeliveryDetailsParams,
} from "./persistence-types";
import type { CommercetoolsCart } from "./provider-cart";

interface AddCommercetoolsCartItem extends AddCartItem {
  readonly cart: CommercetoolsCart;
}

interface SetCommercetoolsCartLineItemQuantity extends SetCartLineItemQuantity {
  readonly cart: CommercetoolsCart;
}

interface RemoveCommercetoolsCartLineItem extends RemoveCartLineItem {
  readonly cart: CommercetoolsCart;
}

interface SaveCommercetoolsCartContact extends SaveCartContact {
  readonly cart: CommercetoolsCart;
  readonly retryConcurrentModification: boolean;
}

interface SaveCommercetoolsCartDeliveryDetails extends SaveCartDeliveryDetails {
  readonly cart: CommercetoolsCart;
}

export interface CommercetoolsCartsPersistence {
  readonly addItem: (
    input: AddCommercetoolsCartItem
  ) => Effect.Effect<
    CommercetoolsCart,
    | CommercetoolsUnavailable
    | CommercetoolsCartAccessDenied
    | CommercetoolsCartVersionConflict
    | CommercetoolsCartWriteOutcomeUnknown
    | CommercetoolsCartMerchandiseUnavailable
  >;
  readonly createAnonymous: (
    input: CreateAnonymousCart
  ) => Effect.Effect<
    CommercetoolsCart,
    CommercetoolsCartAccessDenied | CommercetoolsCartWriteOutcomeUnknown
  >;
  readonly createForBusinessUnit: (
    input: CreateBusinessUnitCart
  ) => Effect.Effect<
    CommercetoolsCart,
    CommercetoolsCartAccessDenied | CommercetoolsCartWriteOutcomeUnknown
  >;
  readonly findActiveForBusinessUnit: (
    input: FindActiveCartsForBusinessUnit
  ) => Effect.Effect<
    readonly CommercetoolsCart[],
    CommercetoolsUnavailable | CommercetoolsCartAccessDenied
  >;
  readonly findById: (
    input: FindCartById
  ) => Effect.Effect<
    CommercetoolsCart,
    | CommercetoolsUnavailable
    | CommercetoolsCartAccessDenied
    | CommercetoolsCartNotFound
  >;
  readonly removeLineItem: (
    input: RemoveCommercetoolsCartLineItem
  ) => Effect.Effect<
    CommercetoolsCart,
    | CommercetoolsCartAccessDenied
    | CommercetoolsCartVersionConflict
    | CommercetoolsCartWriteOutcomeUnknown
  >;
  readonly saveContact: (
    input: SaveCommercetoolsCartContact
  ) => Effect.Effect<
    void,
    | CommercetoolsCartAccessDenied
    | CommercetoolsCartVersionConflict
    | CommercetoolsCartWriteOutcomeUnknown
    | CommercetoolsCartCustomTypeConflict
  >;
  readonly saveDeliveryDetails: (
    input: SaveCommercetoolsCartDeliveryDetails
  ) => Effect.Effect<
    void,
    | CommercetoolsCartAccessDenied
    | CommercetoolsCartVersionConflict
    | CommercetoolsCartWriteOutcomeUnknown
  >;
  readonly setLineItemQuantity: (
    input: SetCommercetoolsCartLineItemQuantity
  ) => Effect.Effect<
    CommercetoolsCart,
    | CommercetoolsCartAccessDenied
    | CommercetoolsCartVersionConflict
    | CommercetoolsCartWriteOutcomeUnknown
  >;
}

const providerFailure = (
  operation: CartOperation,
  error: unknown,
  reason: "unavailable" | "invalidData" | "unexpectedResponse"
) =>
  new CartProviderFailure({
    cause: error,
    operation,
    reason,
  });

const productAttributes = (
  attributes: Record<string, ProductAttributeValue | undefined>
) =>
  Object.fromEntries(
    Object.entries(attributes).filter((entry) => entry[1] !== undefined)
  );

export const decodeCommercetoolsCart = (
  cart: CommercetoolsCart,
  operation: CartOperation
): Effect.Effect<CartSnapshot, CartProviderFailure> => {
  const value = {
    id: CartId.make(cart.id),
    status: cart.cartState === "Active" ? "active" : "inactive",
    storeKey:
      cart.store?.key === null || cart.store?.key === undefined
        ? undefined
        : StoreKey.make(cart.store.key),
    ...(cart.businessUnitId === undefined
      ? {}
      : { buyingContext: { businessUnitId: cart.businessUnitId } }),
    checkoutDetails: cart.checkoutDetails ?? {},
    lineItems: cart.lineItems.map((lineItem) => ({
      id: LineItemId.make(lineItem.id),
      quantity: lineItem.quantity,
      unitPrice: lineItem.price.discounted?.value ?? lineItem.price.value,
      variant:
        lineItem.variant === null
          ? undefined
          : {
              id: VariantId.make(String(lineItem.variant.id)),
              productId: ProductId.make(lineItem.productId),
              ...(lineItem.productType === undefined
                ? {}
                : { productType: lineItem.productType }),
              ...(lineItem.name === null || lineItem.name === undefined
                ? {}
                : { name: lineItem.name }),
              ...(lineItem.variant.sku === undefined
                ? {}
                : { sku: Sku.make(lineItem.variant.sku) }),
              attributes: productAttributes(lineItem.variant.attributes),
              images: lineItem.variant.images,
            },
      ...(lineItem.totalPrice === null
        ? {}
        : { totalPrice: lineItem.totalPrice }),
    })),
    totalLineItemQuantity: cart.totalLineItemQuantity,
    totalPrice: cart.totalPrice,
  };

  return Schema.decodeUnknownEffect(CartSnapshot)(value).pipe(
    Effect.mapError((cause) => providerFailure(operation, cause, "invalidData"))
  );
};

const findById = (
  persistence: CommercetoolsCartsPersistence,
  input: FindCartById
): Effect.Effect<Option.Option<CartSnapshot>, FindCartFailure> =>
  Effect.gen(function* () {
    const result = yield* Effect.result(persistence.findById(input));

    if (result._tag === "Failure") {
      switch (result.failure._tag) {
        case "CommercetoolsCartNotFound":
          return Option.none<CartSnapshot>();
        case "CommercetoolsCartAccessDenied":
          return yield* new CartAccessDenied({
            cartId: input.id,
            operation: "findById",
          });
        case "CommercetoolsUnavailable":
          return yield* providerFailure(
            "findById",
            result.failure,
            "unavailable"
          );
        default:
          return result.failure satisfies never;
      }
    }

    const cart = result.success;
    if (
      cart.cartState !== "Active" ||
      cart.store?.key !== input.store.storeKey ||
      cart.businessUnitId !== undefined ||
      cart.customerId !== undefined
    ) {
      return yield* new CartAccessDenied({
        cartId: input.id,
        operation: "findById",
      });
    }

    return Option.some(yield* decodeCommercetoolsCart(cart, "findById"));
  });

const targetScope = (target: CartTarget) =>
  target._tag === "AnonymousCartTarget"
    ? new StorefrontAnonymousCheckoutScope({
        anonymousCartId: target.id,
        channel: "storefrontAnonymous",
        locale: target.store.locale,
      })
    : new StorefrontCustomerCheckoutScope({
        businessUnitId: target.businessUnitId,
        businessUnitKey: target.businessUnitKey,
        channel: "storefrontCustomer",
        customerId: target.customerId,
        locale: target.store.locale,
      });

const targetOwnsCart = (target: CartTarget, cart: CommercetoolsCart) => {
  if (
    cart.cartState !== "Active" ||
    cart.store?.key !== target.store.storeKey
  ) {
    return false;
  }

  return target._tag === "AnonymousCartTarget"
    ? cart.businessUnitId === undefined && cart.customerId === undefined
    : cart.businessUnitId === target.businessUnitId &&
        (cart.customerId === undefined ||
          cart.customerId === target.customerId);
};

const loadTargetCart = (
  persistence: CommercetoolsCartsPersistence,
  target: CartTarget,
  operation: Exclude<
    CartOperation,
    | "findById"
    | "findActiveForBusinessUnit"
    | "createAnonymous"
    | "createForBusinessUnit"
  >
) =>
  persistence.findById({ id: target.id, store: target.store }).pipe(
    Effect.mapError((error) => {
      switch (error._tag) {
        case "CommercetoolsCartNotFound":
          return new CartNotFound({ cartId: target.id, operation });
        case "CommercetoolsCartAccessDenied":
          return new CartAccessDenied({ cartId: target.id, operation });
        case "CommercetoolsUnavailable":
          return providerFailure(operation, error, "unavailable");
        default:
          return error satisfies never;
      }
    }),
    Effect.filterOrFail(
      (cart) => targetOwnsCart(target, cart),
      () => new CartAccessDenied({ cartId: target.id, operation })
    )
  );

const mapCartWriteFailure = (
  operation: CartOperation,
  cartId: CartId,
  error:
    | CommercetoolsCartAccessDenied
    | CommercetoolsCartVersionConflict
    | CommercetoolsCartWriteOutcomeUnknown
) => {
  switch (error._tag) {
    case "CommercetoolsCartVersionConflict":
      return new CartWriteConflict({ cartId, operation });
    case "CommercetoolsCartAccessDenied":
      return new CartAccessDenied({ cartId, operation });
    case "CommercetoolsCartWriteOutcomeUnknown":
      return new CartWriteOutcomeUnknown({ cartId, operation });
    default:
      return error satisfies never;
  }
};

const findActiveForBusinessUnit = (
  persistence: CommercetoolsCartsPersistence,
  input: FindActiveCartsForBusinessUnit
): Effect.Effect<readonly CartSnapshot[], FindCartsFailure> =>
  persistence.findActiveForBusinessUnit(input).pipe(
    Effect.mapError((error) =>
      error._tag === "CommercetoolsCartAccessDenied"
        ? new CartAccessDenied({
            operation: "findActiveForBusinessUnit",
          })
        : providerFailure("findActiveForBusinessUnit", error, "unavailable")
    ),
    Effect.flatMap((carts) =>
      Effect.forEach(carts, (cart) =>
        decodeCommercetoolsCart(cart, "findActiveForBusinessUnit")
      )
    )
  );

const createCart = (
  persistence: CommercetoolsCartsPersistence,
  operation: "createAnonymous" | "createForBusinessUnit",
  input: CreateAnonymousCart | CreateBusinessUnitCart
): Effect.Effect<CartSnapshot, CreateCartFailure> =>
  (operation === "createAnonymous"
    ? persistence.createAnonymous(input as CreateAnonymousCart)
    : persistence.createForBusinessUnit(input as CreateBusinessUnitCart)
  ).pipe(
    Effect.mapError((error) =>
      error._tag === "CommercetoolsCartAccessDenied"
        ? new CartAccessDenied({ operation })
        : new CartWriteOutcomeUnknown({ operation })
    ),
    Effect.flatMap((cart) => decodeCommercetoolsCart(cart, operation))
  );

const makeProductionPersistence = (
  provider: ReturnType<typeof makeCartPersistence>
): CommercetoolsCartsPersistence => {
  const {
    addItemToCart,
    changeItemQuantity,
    createCart: createProviderCart,
    createCartForAssociateScope,
    findActiveCartsForAssociateScope,
    getCartById,
    removeItemFromCart,
    saveCheckoutContact,
    saveCheckoutDeliveryDetails,
  } = provider;

  return {
    addItem: (input) =>
      addItemToCart({
        id: input.cart.id,
        locale: input.target.store.locale,
        productId: String(input.productId),
        quantity: input.quantity,
        storeKey: input.target.store.storeKey,
        variantId: Number(input.variantId),
        version: input.cart.version,
      } satisfies AddToCartRepoParams),
    createAnonymous: ({ store }) =>
      createProviderCart({
        currency: store.currency,
        locale: store.locale,
        storeKey: store.storeKey,
      } satisfies CreateCartRepoParams),
    createForBusinessUnit: (input) =>
      createCartForAssociateScope({
        associateId: input.customerId,
        businessUnitKey: input.businessUnitKey,
        currency: input.store.currency,
        customerId: input.customerId,
        locale: input.store.locale,
        storeKey: input.store.storeKey,
      } satisfies CreateBusinessUnitCartRepoParams),
    findActiveForBusinessUnit: (input) =>
      findActiveCartsForAssociateScope({
        associateId: input.customerId,
        businessUnitKey: input.businessUnitKey,
        locale: input.store.locale,
        storeKey: input.store.storeKey,
      } satisfies GetActiveCartForAssociateScopeParams),
    findById: ({ id, store }) => getCartById(String(id), store.locale),
    removeLineItem: (input) =>
      removeItemFromCart({
        id: input.cart.id,
        lineItemId: String(input.lineItemId),
        locale: input.target.store.locale,
        version: input.cart.version,
      } satisfies RemoveItemFromCartParams),
    saveContact: (input) =>
      saveCheckoutContact({
        cart: input.cart,
        contact: input.contact,
        locale: input.target.store.locale,
        retryConcurrentModification: input.retryConcurrentModification,
        scope: targetScope(input.target),
      } satisfies SaveCheckoutContactParams),
    saveDeliveryDetails: (input) =>
      saveCheckoutDeliveryDetails({
        cart: input.cart,
        deliveryDetails: input.deliveryDetails,
        locale: input.target.store.locale,
        scope: targetScope(input.target),
      } satisfies SaveCheckoutDeliveryDetailsParams),
    setLineItemQuantity: (input) =>
      changeItemQuantity({
        id: input.cart.id,
        lineItemId: String(input.lineItemId),
        locale: input.target.store.locale,
        quantity: input.quantity,
        version: input.cart.version,
      } satisfies ChangeItemQuantityParams),
  };
};

const makeCarts = (persistence: CommercetoolsCartsPersistence) =>
  Carts.of({
    addItem: (input) =>
      Effect.gen(function* () {
        const variantId = Number(input.variantId);
        if (!Number.isSafeInteger(variantId) || variantId <= 0) {
          return yield* new CartMerchandiseUnavailable({
            productId: input.productId,
            variantId: input.variantId,
          });
        }
        const cart = yield* loadTargetCart(
          persistence,
          input.target,
          "addItem"
        );
        const result = yield* persistence.addItem({ ...input, cart }).pipe(
          Effect.mapError((error) => {
            switch (error._tag) {
              case "CommercetoolsCartMerchandiseUnavailable":
                return new CartMerchandiseUnavailable({
                  productId: input.productId,
                  variantId: input.variantId,
                });
              case "CommercetoolsCartVersionConflict":
                return new CartWriteConflict({
                  cartId: input.target.id,
                  operation: "addItem",
                });
              case "CommercetoolsCartAccessDenied":
                return new CartAccessDenied({
                  cartId: input.target.id,
                  operation: "addItem",
                });
              case "CommercetoolsUnavailable":
                return providerFailure("addItem", error, "unavailable");
              case "CommercetoolsCartWriteOutcomeUnknown":
                return new CartWriteOutcomeUnknown({
                  cartId: input.target.id,
                  operation: "addItem",
                });
              default:
                return error satisfies never;
            }
          })
        );
        return yield* decodeCommercetoolsCart(result, "addItem");
      }),
    createAnonymous: (input) =>
      createCart(persistence, "createAnonymous", input),
    createForBusinessUnit: (input) =>
      createCart(persistence, "createForBusinessUnit", input),
    findActiveForBusinessUnit: (input) =>
      findActiveForBusinessUnit(persistence, input),
    findById: (input) => findById(persistence, input),
    removeLineItem: (input) =>
      Effect.gen(function* () {
        const cart = yield* loadTargetCart(
          persistence,
          input.target,
          "removeLineItem"
        );
        if (
          !cart.lineItems.some((lineItem) => lineItem.id === input.lineItemId)
        ) {
          return yield* new CartLineItemNotFound({
            cartId: input.target.id,
            lineItemId: input.lineItemId,
            operation: "removeLineItem",
          });
        }
        const result = yield* persistence
          .removeLineItem({ ...input, cart })
          .pipe(
            Effect.mapError((error) =>
              mapCartWriteFailure("removeLineItem", input.target.id, error)
            )
          );
        return yield* decodeCommercetoolsCart(result, "removeLineItem");
      }),
    saveContact: (input) =>
      Effect.gen(function* () {
        let cart = yield* loadTargetCart(
          persistence,
          input.target,
          "saveContact"
        );
        if (hasPersistedCheckoutContact(cart, input.contact)) {
          return yield* decodeCommercetoolsCart(cart, "saveContact");
        }

        const write = (retryConcurrentModification: boolean) =>
          persistence.saveContact({
            ...input,
            cart,
            retryConcurrentModification,
          });
        let result = yield* Effect.result(write(true));

        if (
          result._tag === "Failure" &&
          result.failure._tag === "CommercetoolsCartVersionConflict"
        ) {
          if (cart.custom?.type?.key === ORDER_CUSTOM_TYPE_KEY) {
            return yield* new CartWriteConflict({
              cartId: input.target.id,
              operation: "saveContact",
            });
          }

          cart = yield* loadTargetCart(
            persistence,
            input.target,
            "saveContact"
          );
          if (hasPersistedCheckoutContact(cart, input.contact)) {
            return yield* decodeCommercetoolsCart(cart, "saveContact");
          }
          result = yield* Effect.result(write(false));
        }

        if (result._tag === "Failure") {
          if (result.failure._tag === "CommercetoolsCartCustomTypeConflict") {
            return yield* providerFailure(
              "saveContact",
              result.failure,
              "invalidData"
            );
          }
          return yield* mapCartWriteFailure(
            "saveContact",
            input.target.id,
            result.failure
          );
        }

        const refreshed = yield* loadTargetCart(
          persistence,
          input.target,
          "saveContact"
        );
        return yield* decodeCommercetoolsCart(refreshed, "saveContact");
      }),
    saveDeliveryDetails: (input) =>
      Effect.gen(function* () {
        const cart = yield* loadTargetCart(
          persistence,
          input.target,
          "saveDeliveryDetails"
        );
        yield* persistence
          .saveDeliveryDetails({ ...input, cart })
          .pipe(
            Effect.mapError((error) =>
              mapCartWriteFailure("saveDeliveryDetails", input.target.id, error)
            )
          );
        const refreshed = yield* loadTargetCart(
          persistence,
          input.target,
          "saveDeliveryDetails"
        );
        return yield* decodeCommercetoolsCart(refreshed, "saveDeliveryDetails");
      }),
    setLineItemQuantity: (input) =>
      Effect.gen(function* () {
        const cart = yield* loadTargetCart(
          persistence,
          input.target,
          "setLineItemQuantity"
        );
        if (
          !cart.lineItems.some((lineItem) => lineItem.id === input.lineItemId)
        ) {
          return yield* new CartLineItemNotFound({
            cartId: input.target.id,
            lineItemId: input.lineItemId,
            operation: "setLineItemQuantity",
          });
        }
        const result = yield* persistence
          .setLineItemQuantity({ ...input, cart })
          .pipe(
            Effect.mapError((error) =>
              mapCartWriteFailure("setLineItemQuantity", input.target.id, error)
            )
          );
        return yield* decodeCommercetoolsCart(result, "setLineItemQuantity");
      }),
  });

export const cartsLayerFrom = (persistence: CommercetoolsCartsPersistence) =>
  Layer.succeed(Carts, makeCarts(persistence));

const cartsImplementationLayer = Layer.effect(
  Carts,
  Effect.gen(function* () {
    const graphqlClient = yield* CommercetoolsGraphQLClient;
    const restClient = yield* CommercetoolsRestClient;
    const persistence = makeProductionPersistence(
      makeCartPersistence({
        apiRoot: restClient.apiRoot,
        graphqlClient,
      })
    );

    return makeCarts(persistence);
  })
);

export const cartsLayer = cartsImplementationLayer.pipe(
  Layer.provide(commercetoolsClientsLayer)
);
