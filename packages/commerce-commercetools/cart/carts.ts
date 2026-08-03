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
  ActionResult,
  DomainError,
} from "@repo/commerce/lib/utils/errors";
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
  readonly findById: (
    input: FindCartById
  ) => Promise<ActionResult<CommercetoolsCart>>;
  readonly findActiveForBusinessUnit: (
    input: FindActiveCartsForBusinessUnit
  ) => Promise<ActionResult<readonly CommercetoolsCart[]>>;
  readonly createAnonymous: (
    input: CreateAnonymousCart
  ) => Promise<ActionResult<CommercetoolsCart>>;
  readonly createForBusinessUnit: (
    input: CreateBusinessUnitCart
  ) => Promise<ActionResult<CommercetoolsCart>>;
  readonly addItem: (
    input: AddCommercetoolsCartItem
  ) => Promise<ActionResult<CommercetoolsCart>>;
  readonly setLineItemQuantity: (
    input: SetCommercetoolsCartLineItemQuantity
  ) => Promise<ActionResult<CommercetoolsCart>>;
  readonly removeLineItem: (
    input: RemoveCommercetoolsCartLineItem
  ) => Promise<ActionResult<CommercetoolsCart>>;
  readonly saveContact: (
    input: SaveCommercetoolsCartContact
  ) => Promise<ActionResult<void>>;
  readonly saveDeliveryDetails: (
    input: SaveCommercetoolsCartDeliveryDetails
  ) => Promise<ActionResult<void>>;
}

const providerFailure = (
  operation: CartOperation,
  error: unknown,
  reason: "unavailable" | "invalidData" | "unexpectedResponse"
) =>
  new CartProviderFailure({
    operation,
    reason,
    cause: error,
  });

const providerFailureFromDomain = (
  operation: CartOperation,
  error: DomainError<object>
) =>
  providerFailure(
    operation,
    error,
    error.code === "NETWORK_ERROR" ? "unavailable" : "unexpectedResponse"
  );

const runPersistence = <A>(
  operation: CartOperation,
  run: () => Promise<ActionResult<A>>
): Effect.Effect<ActionResult<A>, CartProviderFailure> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => providerFailure(operation, cause, "unavailable"),
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
    lineItems: cart.lineItems.map((lineItem) => ({
      id: LineItemId.make(lineItem.id),
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
              images: lineItem.variant.images,
              attributes: productAttributes(lineItem.variant.attributes),
            },
      quantity: lineItem.quantity,
      unitPrice: lineItem.price.discounted?.value ?? lineItem.price.value,
      ...(lineItem.totalPrice === null
        ? {}
        : { totalPrice: lineItem.totalPrice }),
    })),
    totalLineItemQuantity: cart.totalLineItemQuantity,
    totalPrice: cart.totalPrice,
    checkoutDetails: cart.checkoutDetails ?? {},
  };

  return Schema.decodeUnknownEffect(CartSnapshot)(value).pipe(
    Effect.mapError((cause) => providerFailure(operation, cause, "invalidData"))
  );
};

const isAccessFailure = (error: DomainError<object>) =>
  error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED";

const findById = (
  persistence: CommercetoolsCartsPersistence,
  input: FindCartById
): Effect.Effect<Option.Option<CartSnapshot>, FindCartFailure> =>
  Effect.gen(function* () {
    const result = yield* runPersistence("findById", () =>
      persistence.findById(input)
    );
    if (result.ok) {
      if (
        result.data.cartState !== "Active" ||
        result.data.store?.key !== input.store.storeKey ||
        result.data.businessUnitId !== undefined ||
        result.data.customerId !== undefined
      ) {
        return yield* new CartAccessDenied({
          cartId: input.id,
          operation: "findById",
        });
      }
      return Option.some(
        yield* decodeCommercetoolsCart(result.data, "findById")
      );
    }
    if (result.error.code === "NOT_FOUND") {
      return Option.none<CartSnapshot>();
    }
    if (isAccessFailure(result.error)) {
      return yield* new CartAccessDenied({
        cartId: input.id,
        operation: "findById",
      });
    }
    return yield* providerFailureFromDomain("findById", result.error);
  });

const targetScope = (target: CartTarget) =>
  target._tag === "AnonymousCartTarget"
    ? new StorefrontAnonymousCheckoutScope({
        channel: "storefrontAnonymous",
        locale: target.store.locale,
        anonymousCartId: target.id,
      })
    : new StorefrontCustomerCheckoutScope({
        channel: "storefrontCustomer",
        locale: target.store.locale,
        customerId: target.customerId,
        businessUnitId: target.businessUnitId,
        businessUnitKey: target.businessUnitKey,
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
  Effect.gen(function* () {
    const result = yield* runPersistence(operation, () =>
      persistence.findById({ id: target.id, store: target.store })
    );
    if (!result.ok) {
      if (result.error.code === "NOT_FOUND") {
        return yield* new CartNotFound({ cartId: target.id, operation });
      }
      if (isAccessFailure(result.error)) {
        return yield* new CartAccessDenied({
          cartId: target.id,
          operation,
        });
      }
      return yield* providerFailureFromDomain(operation, result.error);
    }

    if (!targetOwnsCart(target, result.data)) {
      return yield* new CartAccessDenied({
        cartId: target.id,
        operation,
      });
    }

    return result.data;
  });

const mapRepeatableWriteFailure = (
  operation: CartOperation,
  cartId: CartId,
  error: DomainError<object>
) => {
  if (error.code === "CONFLICT") {
    return new CartWriteConflict({ cartId, operation });
  }
  if (isAccessFailure(error)) {
    return new CartAccessDenied({ cartId, operation });
  }
  if (error.code === "NOT_FOUND") {
    return new CartNotFound({ cartId, operation });
  }
  return providerFailureFromDomain(operation, error);
};

const findActiveForBusinessUnit = (
  persistence: CommercetoolsCartsPersistence,
  input: FindActiveCartsForBusinessUnit
): Effect.Effect<readonly CartSnapshot[], FindCartsFailure> =>
  Effect.gen(function* () {
    const result = yield* runPersistence("findActiveForBusinessUnit", () =>
      persistence.findActiveForBusinessUnit(input)
    );
    if (!result.ok) {
      if (isAccessFailure(result.error)) {
        return yield* new CartAccessDenied({
          operation: "findActiveForBusinessUnit",
        });
      }
      return yield* providerFailureFromDomain(
        "findActiveForBusinessUnit",
        result.error
      );
    }
    return yield* Effect.forEach(result.data, (cart) =>
      decodeCommercetoolsCart(cart, "findActiveForBusinessUnit")
    );
  });

const createCart = (
  persistence: CommercetoolsCartsPersistence,
  operation: "createAnonymous" | "createForBusinessUnit",
  input: CreateAnonymousCart | CreateBusinessUnitCart
): Effect.Effect<CartSnapshot, CreateCartFailure> =>
  Effect.gen(function* () {
    const result = yield* runPersistence(operation, () =>
      operation === "createAnonymous"
        ? persistence.createAnonymous(input as CreateAnonymousCart)
        : persistence.createForBusinessUnit(input as CreateBusinessUnitCart)
    );
    if (!result.ok) {
      if (isAccessFailure(result.error)) {
        return yield* new CartAccessDenied({ operation });
      }
      return yield* new CartWriteOutcomeUnknown({ operation });
    }
    return yield* decodeCommercetoolsCart(result.data, operation);
  });

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
    findById: ({ id, store }) => getCartById(String(id), store.locale),
    findActiveForBusinessUnit: (input) =>
      findActiveCartsForAssociateScope({
        associateId: input.customerId,
        businessUnitKey: input.businessUnitKey,
        storeKey: input.store.storeKey,
        locale: input.store.locale,
      } satisfies GetActiveCartForAssociateScopeParams),
    createAnonymous: ({ store }) =>
      createProviderCart({
        locale: store.locale,
        currency: store.currency,
        storeKey: store.storeKey,
      } satisfies CreateCartRepoParams),
    createForBusinessUnit: (input) =>
      createCartForAssociateScope({
        associateId: input.customerId,
        businessUnitKey: input.businessUnitKey,
        customerId: input.customerId,
        storeKey: input.store.storeKey,
        locale: input.store.locale,
        currency: input.store.currency,
      } satisfies CreateBusinessUnitCartRepoParams),
    addItem: (input) =>
      addItemToCart({
        id: input.cart.id,
        version: input.cart.version,
        productId: String(input.productId),
        variantId: Number(input.variantId),
        quantity: input.quantity,
        locale: input.target.store.locale,
        storeKey: input.target.store.storeKey,
      } satisfies AddToCartRepoParams),
    setLineItemQuantity: (input) =>
      changeItemQuantity({
        id: input.cart.id,
        version: input.cart.version,
        lineItemId: String(input.lineItemId),
        quantity: input.quantity,
        locale: input.target.store.locale,
      } satisfies ChangeItemQuantityParams),
    removeLineItem: (input) =>
      removeItemFromCart({
        id: input.cart.id,
        version: input.cart.version,
        lineItemId: String(input.lineItemId),
        locale: input.target.store.locale,
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
  };
};

const makeCarts = (persistence: CommercetoolsCartsPersistence) =>
  Carts.of({
    findById: (input) => findById(persistence, input),
    findActiveForBusinessUnit: (input) =>
      findActiveForBusinessUnit(persistence, input),
    createAnonymous: (input) =>
      createCart(persistence, "createAnonymous", input),
    createForBusinessUnit: (input) =>
      createCart(persistence, "createForBusinessUnit", input),
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
        const result = yield* runPersistence("addItem", () =>
          persistence.addItem({ ...input, cart })
        );
        if (result.ok) {
          return yield* decodeCommercetoolsCart(result.data, "addItem");
        }
        if (result.error.code === "BAD_INPUT") {
          return yield* new CartMerchandiseUnavailable({
            productId: input.productId,
            variantId: input.variantId,
          });
        }
        if (result.error.code === "CONFLICT") {
          return yield* new CartWriteConflict({
            cartId: input.target.id,
            operation: "addItem",
          });
        }
        if (isAccessFailure(result.error)) {
          return yield* new CartAccessDenied({
            cartId: input.target.id,
            operation: "addItem",
          });
        }
        return yield* new CartWriteOutcomeUnknown({
          cartId: input.target.id,
          operation: "addItem",
        });
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
        const result = yield* runPersistence("setLineItemQuantity", () =>
          persistence.setLineItemQuantity({ ...input, cart })
        );
        if (!result.ok) {
          if (
            result.error.code === "BAD_INPUT" ||
            result.error.code === "NOT_FOUND"
          ) {
            return yield* new CartLineItemNotFound({
              cartId: input.target.id,
              lineItemId: input.lineItemId,
              operation: "setLineItemQuantity",
            });
          }
          return yield* mapRepeatableWriteFailure(
            "setLineItemQuantity",
            input.target.id,
            result.error
          );
        }
        return yield* decodeCommercetoolsCart(
          result.data,
          "setLineItemQuantity"
        );
      }),
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
        const result = yield* runPersistence("removeLineItem", () =>
          persistence.removeLineItem({ ...input, cart })
        );
        if (!result.ok) {
          if (
            result.error.code === "BAD_INPUT" ||
            result.error.code === "NOT_FOUND"
          ) {
            return yield* new CartLineItemNotFound({
              cartId: input.target.id,
              lineItemId: input.lineItemId,
              operation: "removeLineItem",
            });
          }
          return yield* mapRepeatableWriteFailure(
            "removeLineItem",
            input.target.id,
            result.error
          );
        }
        return yield* decodeCommercetoolsCart(result.data, "removeLineItem");
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
          runPersistence("saveContact", () =>
            persistence.saveContact({
              ...input,
              cart,
              retryConcurrentModification,
            })
          );
        let result = yield* write(true);

        if (!result.ok && result.error.code === "CONFLICT") {
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
          result = yield* write(false);
        }

        if (!result.ok) {
          if (result.error.code === "BAD_INPUT") {
            return yield* providerFailure(
              "saveContact",
              result.error,
              "invalidData"
            );
          }
          return yield* mapRepeatableWriteFailure(
            "saveContact",
            input.target.id,
            result.error
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
        const result = yield* runPersistence("saveDeliveryDetails", () =>
          persistence.saveDeliveryDetails({ ...input, cart })
        );
        if (!result.ok) {
          return yield* mapRepeatableWriteFailure(
            "saveDeliveryDetails",
            input.target.id,
            result.error
          );
        }
        const refreshed = yield* loadTargetCart(
          persistence,
          input.target,
          "saveDeliveryDetails"
        );
        return yield* decodeCommercetoolsCart(refreshed, "saveDeliveryDetails");
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
