import type {
  ByProjectKeyRequestBuilder,
  CartUpdateAction,
} from "@commercetools/platform-sdk";
import type { AddressBookReference } from "@repo/commerce/domain/address-book";
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
  CartProviderFailure,
  CartWriteConflict,
  CartWriteOutcomeUnknown,
} from "@repo/commerce/domain/cart-errors";
import type { CartOperation } from "@repo/commerce/domain/cart-errors";
import { CartSnapshot } from "@repo/commerce/domain/cart-snapshot";
import type {
  CartTarget,
  ProductAttributeValue,
} from "@repo/commerce/domain/cart-snapshot";
import {
  CheckoutContact,
  ShippingAddress,
  StorefrontAnonymousCheckoutScope,
  StorefrontCustomerCheckoutScope,
} from "@repo/commerce/domain/checkout";
import type {
  CheckoutDeliveryDetails,
  CheckoutDetails,
} from "@repo/commerce/domain/checkout";
import { CommerceBusinessUnitId } from "@repo/commerce/domain/commerce-account";
import { Carts } from "@repo/commerce/services/carts";
import type {
  AddCartItem,
  CreateAnonymousCart,
  CreateBusinessUnitCart,
  FindActiveCartsForBusinessUnit,
  FindCartById,
  RemoveCartLineItem,
  SaveCartContact,
  SaveCartDeliveryDetails,
  SetCartLineItemQuantity,
} from "@repo/commerce/services/carts";
import { StoreKey } from "@repo/commerce/store";
import type { CurrencyCode, Locale } from "@repo/i18n/types";
import type { Client } from "@urql/core";
import { Effect, Layer, Option, Schema } from "effect";
import type { FragmentOf } from "gql.tada";

import { fromCommercetoolsAddressKey } from "../address-book/address-book-key";
import { CommercetoolsGraphQLClient } from "../client/graphql-client";
import { CommercetoolsRestClient } from "../client/rest-client";
import {
  commercetoolsFailureCause,
  commercetoolsRequest,
  hasCommercetoolsErrorCode,
  isCommercetoolsAccessDenied,
  isCommercetoolsClientFailure,
  isConcurrentModification,
  PreserveVersionedWriteConflict,
  RetryVersionedWrite,
  retryVersionedWrite,
} from "../client/versioned-write";
import type {
  CommercetoolsConcurrentModification,
  VersionedWriteConflictResolution,
} from "../client/versioned-write";
import { readFragment } from "../graphql";
import { reshapeProductAttributes } from "./attributes";
import type { ProductTypeKey } from "./attributes";
import {
  buildSaveCheckoutContactActions,
  CHECKOUT_CONTACT_CUSTOM_FIELD_NAME,
  hasPersistedCheckoutContact,
  ORDER_CUSTOM_TYPE_KEY,
} from "./contact-actions";
import { buildSaveCheckoutDeliveryDetailsActions } from "./delivery-details-actions";
import { CartFragment } from "./graphql/fragments";
import {
  AddItemToCartMutation,
  ChangeItemsQuantityMutation,
  CreateCartMutation,
  RemoveItemFromCartMutation,
  SaveCheckoutContactMutation,
  SaveCheckoutDeliveryDetailsMutation,
} from "./graphql/mutations";
import {
  CartDistributionChannelQuery,
  GetActiveCartForBusinessUnitAsAssociateQuery,
  GetCartByIdQuery,
} from "./graphql/queries";
import { reshapePrice } from "./price";
import type { CommercetoolsCart, CommercetoolsLineItem } from "./provider-cart";

type GraphqlClient = Pick<Client, "query" | "mutation">;

type RawCustomField = {
  readonly name: string;
  readonly value: unknown;
};

type ProviderErrorPayload = {
  readonly networkError?: unknown;
};

// ---------------------------------------------------------------------------
// Failures
//
// This Layer owns the only projection from a Commercetools failure to a Cart
// domain failure. Per ADR-0005 an infrastructure adapter inspects an untyped
// provider exception once; no intermediate error vocabulary sits between the
// provider and the capability contract.
// ---------------------------------------------------------------------------

const providerFailure = (
  operation: CartOperation,
  cause: unknown,
  reason: "unavailable" | "invalidData" | "unexpectedResponse"
) =>
  new CartProviderFailure({
    cause,
    operation,
    reason,
  });

const accessDenied = (operation: CartOperation, cartId?: CartId) =>
  cartId === undefined
    ? new CartAccessDenied({ operation })
    : new CartAccessDenied({ cartId, operation });

const writeOutcomeUnknown = (operation: CartOperation, cartId?: CartId) =>
  cartId === undefined
    ? new CartWriteOutcomeUnknown({ operation })
    : new CartWriteOutcomeUnknown({ cartId, operation });

const providerContractDefect = (message: string) => new Error(message);

/** A provider response that violates its documented contract is a defect. */
const dieOnContractViolation = (message: string) =>
  Effect.die(providerContractDefect(message));

const failedRead = (
  operation: CartOperation,
  cartId: CartId | undefined,
  error: ProviderErrorPayload
): Effect.Effect<never, CartAccessDenied | CartProviderFailure> => {
  if (error.networkError !== undefined) {
    return Effect.fail(providerFailure(operation, error, "unavailable"));
  }

  if (isCommercetoolsAccessDenied(error)) {
    return Effect.fail(accessDenied(operation, cartId));
  }

  return Effect.die(error);
};

const failedWrite = (
  operation: CartOperation,
  cartId: CartId,
  cause: unknown
): Effect.Effect<
  never,
  CartAccessDenied | CartWriteConflict | CartWriteOutcomeUnknown
> => {
  const providerCause = commercetoolsFailureCause(cause);

  if (isConcurrentModification(cause)) {
    return Effect.fail(new CartWriteConflict({ cartId, operation }));
  }

  if (isCommercetoolsAccessDenied(providerCause)) {
    return Effect.fail(new CartAccessDenied({ cartId, operation }));
  }

  if (isCommercetoolsClientFailure(providerCause)) {
    return Effect.die(providerCause);
  }

  return Effect.fail(new CartWriteOutcomeUnknown({ cartId, operation }));
};

const failedCreate = (
  operation: "createAnonymous" | "createForBusinessUnit",
  cause: unknown
): Effect.Effect<never, CartAccessDenied | CartWriteOutcomeUnknown> => {
  const providerCause = commercetoolsFailureCause(cause);

  if (isCommercetoolsAccessDenied(providerCause)) {
    return Effect.fail(new CartAccessDenied({ operation }));
  }

  if (isCommercetoolsClientFailure(providerCause)) {
    return Effect.die(providerCause);
  }

  return Effect.fail(new CartWriteOutcomeUnknown({ operation }));
};

const failedMutation = (
  operation: CartOperation,
  cartId: CartId | undefined,
  error: ProviderErrorPayload
): Effect.Effect<never, CartAccessDenied | CartWriteOutcomeUnknown> => {
  if (error.networkError !== undefined) {
    return Effect.fail(writeOutcomeUnknown(operation, cartId));
  }

  if (isCommercetoolsAccessDenied(error)) {
    return Effect.fail(accessDenied(operation, cartId));
  }

  return Effect.die(error);
};

/**
 * A mutation that reports success without returning its Cart leaves the write
 * outcome ambiguous: it may already have been applied.
 */
const missingCartData = (operation: CartOperation, cartId?: CartId) =>
  Effect.fail(writeOutcomeUnknown(operation, cartId));

// ---------------------------------------------------------------------------
// Projections
//
// `toCommercetoolsCart` reads a provider response into the provider's own Cart,
// which carries the resource `version` that writes need. `toCart` projects that
// into the provider-neutral domain Cart at the edge of the capability.
// ---------------------------------------------------------------------------

const CommerceShippingAddress = Schema.Struct({
  additionalStreetInfo: Schema.NullOr(Schema.String),
  city: Schema.NullOr(Schema.String),
  country: Schema.String,
  key: Schema.NullOr(Schema.String),
  postalCode: Schema.NullOr(Schema.String),
  region: Schema.NullOr(Schema.String),
  streetName: Schema.NullOr(Schema.String),
});

type DecodedShippingAddress = {
  readonly shippingAddress: ShippingAddress;
  readonly addressBookReference?: AddressBookReference;
};

const decodeShippingAddress = (
  value: unknown
): Option.Option<DecodedShippingAddress> =>
  Schema.decodeUnknownOption(CommerceShippingAddress)(value).pipe(
    Option.flatMap((address) =>
      Schema.decodeUnknownOption(ShippingAddress)({
        addressLine1: address.streetName,
        city: address.city,
        country: address.country,
        postalCode: address.postalCode,
        ...(address.additionalStreetInfo === null
          ? {}
          : { addressLine2: address.additionalStreetInfo }),
        ...(address.region === null ? {} : { region: address.region }),
      }).pipe(
        Option.map((shippingAddress) => {
          const addressBookReference =
            address.key === null
              ? undefined
              : fromCommercetoolsAddressKey(address.key);

          return {
            shippingAddress,
            ...(addressBookReference === undefined
              ? {}
              : { addressBookReference }),
          };
        })
      )
    )
  );

const parseCustomJson = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    // Invalid custom JSON is handled as absent checkout data.
  }
};

const decodeCheckoutContact = (value: unknown) =>
  Option.getOrUndefined(
    Schema.decodeUnknownOption(CheckoutContact)(parseCustomJson(value))
  );

const getCheckoutContactFromCustomFields = (
  customFields: readonly RawCustomField[] | null | undefined
) => {
  const field = customFields?.find(
    (customField) => customField.name === CHECKOUT_CONTACT_CUSTOM_FIELD_NAME
  );

  return field === undefined ? undefined : decodeCheckoutContact(field.value);
};

const getCheckoutDeliveryDetails = (
  decodedShippingAddress: DecodedShippingAddress | null
): CheckoutDeliveryDetails | undefined => {
  if (decodedShippingAddress === null) {
    return;
  }

  const { addressBookReference, shippingAddress } = decodedShippingAddress;

  return addressBookReference === undefined
    ? { shippingAddress, source: "manual" }
    : { addressBookReference, shippingAddress, source: "addressBook" };
};

const getCheckoutDetails = (
  customFields: readonly RawCustomField[] | null | undefined,
  decodedShippingAddress: DecodedShippingAddress | null
): CheckoutDetails => {
  const contact = getCheckoutContactFromCustomFields(customFields);
  const deliveryDetails = getCheckoutDeliveryDetails(decodedShippingAddress);

  return {
    ...(contact === undefined ? {} : { contact }),
    ...(deliveryDetails === undefined ? {} : { deliveryDetails }),
  };
};

const toCommercetoolsCart = (
  fragment: FragmentOf<typeof CartFragment>,
  locale: Locale
): CommercetoolsCart => {
  const parsedData = readFragment(CartFragment, fragment);
  const decodedShippingAddress = Option.getOrNull(
    decodeShippingAddress(parsedData.shippingAddress)
  );
  const shippingAddress = decodedShippingAddress?.shippingAddress ?? null;

  const lineItems: CommercetoolsLineItem[] = parsedData.lineItems.map(
    (item) => ({
      id: item.id,
      name: item.name,
      productId: item.productId,
      ...(item.productType?.key === undefined
        ? {}
        : { productType: item.productType.key as ProductTypeKey }),
      price: reshapePrice(item.price),
      quantity: item.quantity,
      totalPrice: item.totalPrice
        ? {
            centAmount: item.totalPrice.centAmount,
            currencyCode: item.totalPrice.currencyCode as CurrencyCode,
          }
        : null,
      variant: item.variant
        ? {
            id: item.variant.id,
            ...(item.variant.sku === null ? {} : { sku: item.variant.sku }),
            attributes: reshapeProductAttributes(
              item.productType?.key as ProductTypeKey,
              item.variant.attributesRaw,
              locale
            ),
            images: item.variant.images.map((image) => ({
              altText: image.label ?? "",
              url: image.url,
            })),
          }
        : null,
    })
  );

  return {
    ...parsedData,
    ...(parsedData.businessUnit === null
      ? {}
      : {
          businessUnitId: CommerceBusinessUnitId.make(
            parsedData.businessUnit.id
          ),
        }),
    checkoutDetails: getCheckoutDetails(
      parsedData.custom?.customFieldsRaw,
      decodedShippingAddress
    ),
    lineItems,
    shippingAddress,
    totalLineItemQuantity: parsedData.totalLineItemQuantity ?? 0,
    totalPrice: {
      centAmount: parsedData.totalPrice.centAmount,
      currencyCode: parsedData.totalPrice.currencyCode,
    },
  };
};

const productAttributes = (
  attributes: Record<string, ProductAttributeValue | undefined>
) =>
  Object.fromEntries(
    Object.entries(attributes).filter((entry) => entry[1] !== undefined)
  );

export const toCart = (
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

// ---------------------------------------------------------------------------
// Cart ownership
// ---------------------------------------------------------------------------

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

const activeCartForStorePredicate = (storeKey: string) =>
  `cartState="Active" and store(key=${JSON.stringify(storeKey)})`;

// ---------------------------------------------------------------------------
// Provider write plumbing
// ---------------------------------------------------------------------------

interface GraphqlVersionedWriteResult {
  readonly error?: unknown;
}

const executeVersionedGraphqlWrite = <
  Input,
  Result extends GraphqlVersionedWriteResult,
>({
  operation,
  input,
  execute,
  resolveConflict,
}: {
  readonly operation: string;
  readonly input: Input;
  readonly execute: (input: Input) => PromiseLike<Result>;
  readonly resolveConflict: (
    conflict: CommercetoolsConcurrentModification,
    input: Input
  ) => Effect.Effect<VersionedWriteConflictResolution<Input>>;
}) =>
  retryVersionedWrite({
    attempt: (current) =>
      commercetoolsRequest(
        `Failed to execute GraphQL mutation ${operation}`,
        () => execute(current)
      ).pipe(
        Effect.flatMap((result) =>
          result.error !== undefined && isConcurrentModification(result.error)
            ? Effect.fail(result.error)
            : Effect.succeed(result)
        )
      ),
    input,
    operation,
    resolveConflict,
  });

const retryWithProviderVersion = <Input extends { readonly version: number }>(
  currentVersion: number,
  input: Input
) =>
  Effect.succeed(
    new RetryVersionedWrite({
      ...input,
      version: currentVersion,
    })
  );

const canRetryCartUpdateWithCurrentVersion = (
  actions: readonly CartUpdateAction[]
) => actions.every((action) => action.action !== "setCustomType");

const executeCartUpdateAsAssociate = async (
  apiRoot: ByProjectKeyRequestBuilder,
  {
    actions,
    cartId,
    scope,
    version,
  }: {
    readonly actions: CartUpdateAction[];
    readonly cartId: string;
    readonly scope: StorefrontCustomerCheckoutScope;
    readonly version: number;
  }
) =>
  await apiRoot
    .asAssociate()
    .withAssociateIdValue({
      associateId: String(scope.customerId),
    })
    .inBusinessUnitKeyWithBusinessUnitKeyValue({
      businessUnitKey: String(scope.businessUnitKey),
    })
    .carts()
    .withId({ ID: cartId })
    .post({
      body: {
        actions,
        version,
      },
    })
    .execute();

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const cartsLayer = Layer.effect(
  Carts,
  Effect.gen(function* () {
    const client: GraphqlClient = yield* CommercetoolsGraphQLClient;
    const { apiRoot } = yield* CommercetoolsRestClient;

    const readRequest = <A>(
      operation: CartOperation,
      request: () => PromiseLike<A>
    ): Effect.Effect<A, CartProviderFailure> =>
      Effect.tryPromise({
        catch: (cause) => providerFailure(operation, cause, "unavailable"),
        try: async () => await request(),
      });

    const readCart = Effect.fn("Carts.readCart")(function* (
      cartId: CartId,
      locale: Locale,
      operation: CartOperation
    ) {
      const result = yield* readRequest(operation, () =>
        client.query(GetCartByIdQuery, { id: String(cartId), locale })
      );

      if (result.error !== undefined) {
        return yield* failedRead(operation, cartId, result.error);
      }

      if (result.data === undefined) {
        return yield* dieOnContractViolation(
          "Commercetools returned no data while finding a Cart"
        );
      }

      if (result.data.cart === null) {
        return yield* new CartNotFound({ cartId, operation });
      }

      return toCommercetoolsCart(result.data.cart, locale);
    });

    const loadTargetCart = Effect.fn("Carts.loadTargetCart")(function* (
      target: CartTarget,
      operation: CartOperation
    ) {
      const cart = yield* readCart(target.id, target.store.locale, operation);

      if (!targetOwnsCart(target, cart)) {
        return yield* accessDenied(operation, target.id);
      }

      return cart;
    });

    const updateCartAsAssociate = (
      operation: CartOperation,
      {
        actions,
        cartId,
        retryConcurrentModification = true,
        scope,
        version,
      }: {
        readonly actions: CartUpdateAction[];
        readonly cartId: CartId;
        readonly retryConcurrentModification?: boolean;
        readonly scope: StorefrontCustomerCheckoutScope;
        readonly version: number;
      }
    ) =>
      retryVersionedWrite({
        attempt: (current) =>
          commercetoolsRequest(
            "Failed to update Cart as associate",
            async () =>
              await executeCartUpdateAsAssociate(apiRoot, {
                actions: current.actions,
                cartId: String(current.cartId),
                scope: current.scope,
                version: current.version,
              })
          ).pipe(Effect.asVoid),
        input: { actions, cartId, scope, version },
        operation: "cart.updateAsAssociate",
        resolveConflict: (conflict, current) =>
          Effect.succeed(
            retryConcurrentModification &&
              canRetryCartUpdateWithCurrentVersion(current.actions)
              ? new RetryVersionedWrite({
                  ...current,
                  version: conflict.currentVersion,
                })
              : new PreserveVersionedWriteConflict()
          ),
      }).pipe(Effect.catch((error) => failedWrite(operation, cartId, error)));

    const findById = Effect.fn("Carts.findById")(function* (
      input: FindCartById
    ) {
      const found = yield* readCart(
        input.id,
        input.store.locale,
        "findById"
      ).pipe(
        Effect.map(Option.some),
        Effect.catchTag("CartNotFound", () =>
          Effect.succeed(Option.none<CommercetoolsCart>())
        )
      );

      if (Option.isNone(found)) {
        return Option.none<CartSnapshot>();
      }

      const cart = found.value;

      if (
        cart.cartState !== "Active" ||
        cart.store?.key !== input.store.storeKey ||
        cart.businessUnitId !== undefined ||
        cart.customerId !== undefined
      ) {
        return yield* accessDenied("findById", input.id);
      }

      return Option.some(yield* toCart(cart, "findById"));
    });

    const findActiveForBusinessUnit = Effect.fn(
      "Carts.findActiveForBusinessUnit"
    )(function* (input: FindActiveCartsForBusinessUnit) {
      const operation: CartOperation = "findActiveForBusinessUnit";
      const result = yield* readRequest(operation, () =>
        client.query(GetActiveCartForBusinessUnitAsAssociateQuery, {
          associateId: input.customerId,
          businessUnitKey: input.businessUnitKey,
          locale: input.store.locale,
          where: activeCartForStorePredicate(input.store.storeKey),
        })
      );

      if (result.error !== undefined) {
        return yield* failedRead(operation, undefined, result.error);
      }

      if (result.data === undefined) {
        return yield* dieOnContractViolation(
          "Commercetools returned no data while finding active Carts"
        );
      }

      return yield* Effect.forEach(
        result.data.asAssociate.carts.results,
        (cart) =>
          toCart(toCommercetoolsCart(cart, input.store.locale), operation)
      );
    });

    const createAnonymous = Effect.fn("Carts.createAnonymous")(function* (
      input: CreateAnonymousCart
    ) {
      const operation = "createAnonymous" as const;
      const result = yield* Effect.tryPromise({
        catch: (cause) => cause,
        try: async () =>
          await client.mutation(CreateCartMutation, {
            currency: input.store.currency,
            locale: input.store.locale,
            storeKey: input.store.storeKey,
          }),
      }).pipe(Effect.catch((error) => failedCreate(operation, error)));

      if (result.error !== undefined) {
        return yield* failedMutation(operation, undefined, result.error);
      }

      if (!result.data?.createCart) {
        return yield* missingCartData(operation);
      }

      return yield* toCart(
        toCommercetoolsCart(result.data.createCart, input.store.locale),
        operation
      );
    });

    const createForBusinessUnit = Effect.fn("Carts.createForBusinessUnit")(
      function* (input: CreateBusinessUnitCart) {
        const operation = "createForBusinessUnit" as const;
        const response = yield* commercetoolsRequest(
          "Failed to create Cart as associate",
          async () =>
            await apiRoot
              .asAssociate()
              .withAssociateIdValue({ associateId: String(input.customerId) })
              .inBusinessUnitKeyWithBusinessUnitKeyValue({
                businessUnitKey: String(input.businessUnitKey),
              })
              .carts()
              .post({
                body: {
                  currency: input.store.currency,
                  customerId: String(input.customerId),
                  store: { key: String(input.store.storeKey), typeId: "store" },
                },
              })
              .execute()
        ).pipe(Effect.catch((error) => failedCreate(operation, error)));

        const cartId = CartId.make(response.body.id);
        const cart = yield* readCart(
          cartId,
          input.store.locale,
          operation
        ).pipe(
          Effect.catch(() =>
            Effect.fail(writeOutcomeUnknown(operation, cartId))
          )
        );

        return yield* toCart(cart, operation);
      }
    );

    const addItem = Effect.fn("Carts.addItem")(function* (input: AddCartItem) {
      const operation: CartOperation = "addItem";
      const variantId = Number(input.variantId);

      if (!Number.isSafeInteger(variantId) || variantId <= 0) {
        return yield* new CartMerchandiseUnavailable({
          productId: input.productId,
          variantId: input.variantId,
        });
      }

      const cart = yield* loadTargetCart(input.target, operation);

      const store = yield* readRequest(operation, () =>
        client.query(CartDistributionChannelQuery, {
          storeKey: input.target.store.storeKey,
        })
      );

      if (store.error !== undefined) {
        return yield* failedRead(operation, input.target.id, store.error);
      }

      const distributionChannelKey =
        store.data?.store?.distributionChannels[0]?.key;

      if (distributionChannelKey === undefined) {
        return yield* dieOnContractViolation(
          `Commercetools Store ${String(input.target.store.storeKey)} has no distribution channel`
        );
      }

      const result = yield* executeVersionedGraphqlWrite({
        execute: (current) => client.mutation(AddItemToCartMutation, current),
        input: {
          distributionChannelKey,
          id: cart.id,
          locale: input.target.store.locale,
          productId: String(input.productId),
          quantity: input.quantity,
          variantId,
          version: cart.version,
        },
        operation: "cart.addLineItem",
        resolveConflict: (conflict, current) =>
          retryWithProviderVersion(conflict.currentVersion, current),
      }).pipe(
        Effect.catch((error) => failedWrite(operation, input.target.id, error))
      );

      if (result.error !== undefined) {
        if (
          hasCommercetoolsErrorCode(
            result.error,
            "InvalidInput",
            "MatchingPriceNotFound"
          )
        ) {
          return yield* new CartMerchandiseUnavailable({
            productId: input.productId,
            variantId: input.variantId,
          });
        }

        return yield* failedMutation(operation, input.target.id, result.error);
      }

      if (!result.data?.updateCart) {
        return yield* missingCartData(operation, input.target.id);
      }

      return yield* toCart(
        toCommercetoolsCart(result.data.updateCart, input.target.store.locale),
        operation
      );
    });

    const setLineItemQuantity = Effect.fn("Carts.setLineItemQuantity")(
      function* (input: SetCartLineItemQuantity) {
        const operation: CartOperation = "setLineItemQuantity";
        const cart = yield* loadTargetCart(input.target, operation);

        if (
          !cart.lineItems.some((lineItem) => lineItem.id === input.lineItemId)
        ) {
          return yield* new CartLineItemNotFound({
            cartId: input.target.id,
            lineItemId: input.lineItemId,
            operation,
          });
        }

        const result = yield* executeVersionedGraphqlWrite({
          execute: (current) =>
            client.mutation(ChangeItemsQuantityMutation, current),
          input: {
            id: cart.id,
            lineItemId: String(input.lineItemId),
            locale: input.target.store.locale,
            quantity: input.quantity,
            version: cart.version,
          },
          operation: "cart.changeLineItemQuantity",
          resolveConflict: (conflict, current) =>
            retryWithProviderVersion(conflict.currentVersion, current),
        }).pipe(
          Effect.catch((error) =>
            failedWrite(operation, input.target.id, error)
          )
        );

        if (result.error !== undefined) {
          return yield* failedMutation(
            operation,
            input.target.id,
            result.error
          );
        }

        if (!result.data?.updateCart) {
          return yield* missingCartData(operation, input.target.id);
        }

        return yield* toCart(
          toCommercetoolsCart(
            result.data.updateCart,
            input.target.store.locale
          ),
          operation
        );
      }
    );

    const removeLineItem = Effect.fn("Carts.removeLineItem")(function* (
      input: RemoveCartLineItem
    ) {
      const operation: CartOperation = "removeLineItem";
      const cart = yield* loadTargetCart(input.target, operation);

      if (
        !cart.lineItems.some((lineItem) => lineItem.id === input.lineItemId)
      ) {
        return yield* new CartLineItemNotFound({
          cartId: input.target.id,
          lineItemId: input.lineItemId,
          operation,
        });
      }

      const result = yield* executeVersionedGraphqlWrite({
        execute: (current) =>
          client.mutation(RemoveItemFromCartMutation, current),
        input: {
          id: cart.id,
          lineItemId: String(input.lineItemId),
          locale: input.target.store.locale,
          version: cart.version,
        },
        operation: "cart.removeLineItem",
        resolveConflict: (conflict, current) =>
          retryWithProviderVersion(conflict.currentVersion, current),
      }).pipe(
        Effect.catch((error) => failedWrite(operation, input.target.id, error))
      );

      if (result.error !== undefined) {
        return yield* failedMutation(operation, input.target.id, result.error);
      }

      if (!result.data?.updateCart) {
        return yield* missingCartData(operation, input.target.id);
      }

      return yield* toCart(
        toCommercetoolsCart(result.data.updateCart, input.target.store.locale),
        operation
      );
    });

    const writeCheckoutContact = (
      cart: CommercetoolsCart,
      input: SaveCartContact,
      retryConcurrentModification: boolean
    ) =>
      Effect.gen(function* () {
        const operation: CartOperation = "saveContact";
        const scope = targetScope(input.target);
        const actions = yield* buildSaveCheckoutContactActions(
          cart,
          input.contact
        );

        if (scope.channel === "storefrontCustomer") {
          const contactValue = JSON.stringify(input.contact);
          const restActions: CartUpdateAction[] = [
            {
              action: "setCustomerEmail",
              email: input.contact.buyerContact.email,
            },
            cart.custom?.type?.key === ORDER_CUSTOM_TYPE_KEY
              ? {
                  action: "setCustomField",
                  name: CHECKOUT_CONTACT_CUSTOM_FIELD_NAME,
                  value: contactValue,
                }
              : {
                  action: "setCustomType",
                  fields: {
                    [CHECKOUT_CONTACT_CUSTOM_FIELD_NAME]: contactValue,
                  },
                  type: {
                    key: ORDER_CUSTOM_TYPE_KEY,
                    typeId: "type",
                  },
                },
          ];

          return yield* updateCartAsAssociate(operation, {
            actions: restActions,
            cartId: input.target.id,
            retryConcurrentModification,
            scope,
            version: cart.version,
          });
        }

        const result = yield* executeVersionedGraphqlWrite({
          execute: (current) =>
            client.mutation(SaveCheckoutContactMutation, current),
          input: {
            actions,
            id: cart.id,
            locale: input.target.store.locale,
            version: cart.version,
          },
          operation: "checkout.contact.save",
          resolveConflict: (conflict, current) =>
            retryConcurrentModification &&
            cart.custom?.type?.key === ORDER_CUSTOM_TYPE_KEY
              ? retryWithProviderVersion(conflict.currentVersion, current)
              : Effect.succeed(new PreserveVersionedWriteConflict()),
        }).pipe(
          Effect.catch((error) =>
            failedWrite(operation, input.target.id, error)
          )
        );

        if (result.error !== undefined) {
          return yield* failedMutation(
            operation,
            input.target.id,
            result.error
          );
        }

        if (!result.data?.updateCart) {
          return yield* missingCartData(operation, input.target.id);
        }
      });

    const saveContact = Effect.fn("Carts.saveContact")(function* (
      input: SaveCartContact
    ) {
      const operation: CartOperation = "saveContact";
      let cart = yield* loadTargetCart(input.target, operation);

      if (hasPersistedCheckoutContact(cart, input.contact)) {
        return yield* toCart(cart, operation);
      }

      let result = yield* Effect.result(
        writeCheckoutContact(cart, input, true)
      );

      if (
        result._tag === "Failure" &&
        result.failure._tag === "CartWriteConflict"
      ) {
        // A Cart that already carries the Order custom type cannot resolve the
        // conflict by re-reading: the competing write owns the same field.
        if (cart.custom?.type?.key === ORDER_CUSTOM_TYPE_KEY) {
          return yield* new CartWriteConflict({
            cartId: input.target.id,
            operation,
          });
        }

        cart = yield* loadTargetCart(input.target, operation);

        if (hasPersistedCheckoutContact(cart, input.contact)) {
          return yield* toCart(cart, operation);
        }

        result = yield* Effect.result(writeCheckoutContact(cart, input, false));
      }

      if (result._tag === "Failure") {
        return yield* result.failure;
      }

      const refreshed = yield* loadTargetCart(input.target, operation);
      return yield* toCart(refreshed, operation);
    });

    const saveDeliveryDetails = Effect.fn("Carts.saveDeliveryDetails")(
      function* (input: SaveCartDeliveryDetails) {
        const operation: CartOperation = "saveDeliveryDetails";
        const cart = yield* loadTargetCart(input.target, operation);
        const scope = targetScope(input.target);
        const actions = buildSaveCheckoutDeliveryDetailsActions(
          input.deliveryDetails
        );

        if (scope.channel === "storefrontCustomer") {
          const restActions: CartUpdateAction[] = actions.map(
            ({ setShippingAddress }) => ({
              action: "setShippingAddress",
              address: setShippingAddress.address,
            })
          );

          yield* updateCartAsAssociate(operation, {
            actions: restActions,
            cartId: input.target.id,
            scope,
            version: cart.version,
          });
        } else {
          const result = yield* executeVersionedGraphqlWrite({
            execute: (current) =>
              client.mutation(SaveCheckoutDeliveryDetailsMutation, current),
            input: {
              actions,
              id: cart.id,
              locale: input.target.store.locale,
              version: cart.version,
            },
            operation: "checkout.deliveryDetails.save",
            resolveConflict: (conflict, current) =>
              retryWithProviderVersion(conflict.currentVersion, current),
          }).pipe(
            Effect.catch((error) =>
              failedWrite(operation, input.target.id, error)
            )
          );

          if (result.error !== undefined) {
            return yield* failedMutation(
              operation,
              input.target.id,
              result.error
            );
          }

          if (!result.data?.updateCart) {
            return yield* missingCartData(operation, input.target.id);
          }
        }

        const refreshed = yield* loadTargetCart(input.target, operation);
        return yield* toCart(refreshed, operation);
      }
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
