import type {
  ByProjectKeyRequestBuilder,
  CartUpdateAction,
} from "@commercetools/platform-sdk";
import type { AddressBookReference } from "@repo/commerce/domain/address-book";
import {
  CheckoutContact,
  type CheckoutDeliveryDetails,
  type CheckoutDetails,
  ShippingAddress,
  type StorefrontCustomerCheckoutScope,
} from "@repo/commerce/domain/checkout";
import { CommerceBusinessUnitId } from "@repo/commerce/domain/commerce-account";
import {
  type ActionResult,
  domainError,
  Err,
  Ok,
} from "@repo/commerce/lib/utils/errors";
import type { CurrencyCode, Locale } from "@repo/i18n/types";
import type { Client } from "@urql/core";
import { Effect, Option, Schema } from "effect";
import type { FragmentOf } from "gql.tada";
import { fromCommercetoolsAddressKey } from "../address-book/address-book-key";
import {
  type CommercetoolsConcurrentModification,
  commercetoolsFailureCause,
  commercetoolsRequest,
  isConcurrentModification,
  PreserveVersionedWriteConflict,
  RetryVersionedWrite,
  retryVersionedWrite,
  type VersionedWriteConflictResolution,
} from "../client/versioned-write";
import { graphql, readFragment } from "../graphql";
import { type ProductTypeKey, reshapeProductAttributes } from "./attributes";
import {
  buildSaveCheckoutContactActions,
  CHECKOUT_CONTACT_CUSTOM_FIELD_NAME,
  ORDER_CUSTOM_TYPE_KEY,
} from "./contact-actions";
import { buildSaveCheckoutDeliveryDetailsActions } from "./delivery-details-actions";
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
import { productPriceFragment, reshapePrice } from "./price";
import type { CommercetoolsCart, CommercetoolsLineItem } from "./provider-cart";

type RawCustomField = {
  readonly name: string;
  readonly value: unknown;
};

const CommerceShippingAddress = Schema.Struct({
  key: Schema.NullOr(Schema.String),
  streetName: Schema.NullOr(Schema.String),
  postalCode: Schema.NullOr(Schema.String),
  city: Schema.NullOr(Schema.String),
  country: Schema.String,
  additionalStreetInfo: Schema.NullOr(Schema.String),
  region: Schema.NullOr(Schema.String),
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
        postalCode: address.postalCode,
        city: address.city,
        country: address.country,
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
    return undefined;
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
    return undefined;
  }

  const { addressBookReference, shippingAddress } = decodedShippingAddress;

  return addressBookReference === undefined
    ? { source: "manual", shippingAddress }
    : { source: "addressBook", addressBookReference, shippingAddress };
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

const CartFragment = graphql(
  `
  fragment CartFields on Cart {
    id
    version
    country
    customerEmail
    shippingAddress {
      key
      streetName
      postalCode
      city
      country
      additionalStreetInfo
      region
    }
    store {
      key
    }
    businessUnit {
      id
    }
    custom {
      type {
        key
      }
      customFieldsRaw {
        name
        value
      }
    }
    lineItems {
      id
      key
      productId
      productType {
        key
      }
      name(locale: $locale)
      quantity
      variant {
        id
        sku
        attributesRaw {
          name
          value
        }
        images {
          url
          label
        }
      }
      price {
          ... ProductPrice
      }
      totalPrice {
        currencyCode
        centAmount
      }
    }
    totalLineItemQuantity
    totalPrice {
      currencyCode
      centAmount
    }
    version
    cartState
  }
`,
  [productPriceFragment]
);

const reshapeCart = (
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
      quantity: item.quantity,
      price: reshapePrice(item.price),
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
            images:
              item.variant.images.map((image) => ({
                url: image.url,
                altText: image.label ?? "",
              })) || [],
            attributes: reshapeProductAttributes(
              item.productType?.key as ProductTypeKey,
              item.variant.attributesRaw || [],
              locale
            ),
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
    lineItems,
    checkoutDetails: getCheckoutDetails(
      parsedData.custom?.customFieldsRaw,
      decodedShippingAddress
    ),
    shippingAddress,
    totalPrice: {
      centAmount: parsedData.totalPrice.centAmount,
      currencyCode: parsedData.totalPrice.currencyCode as CurrencyCode,
    },
    totalLineItemQuantity: parsedData.totalLineItemQuantity ?? 0,
  };
};

const CreateCartMutation = graphql(
  `
  mutation CreateCart($currency: Currency!, $storeKey: String!, $locale: Locale!) {
    createCart(
      draft: {
        currency: $currency
        store: {
          key: $storeKey
        }
      }
    ) {
      ...CartFields
    }
  }
`,
  [CartFragment]
);

const GetActiveCartForBusinessUnitAsAssociateQuery = graphql(
  `
  query GetActiveCartForBusinessUnitAsAssociate(
    $associateId: String!
    $businessUnitKey: KeyReferenceInput!
    $where: String!
    $locale: Locale!
  ) {
    asAssociate(
      associateId: $associateId
      businessUnitKey: $businessUnitKey
    ) {
      carts(where: $where, sort: ["lastModifiedAt desc"], limit: 2) {
        results {
          ...CartFields
        }
      }
    }
  }
`,
  [CartFragment]
);

const GetCartByIdQuery = graphql(
  `
  query CartById($id: String!, $locale: Locale!) {
    cart(id: $id) {
      ...CartFields
    }
  }
`,
  [CartFragment]
);

const AddItemToCartMutation = graphql(
  `
  mutation AddItemToCart($id: String!, $version: Long!, $productId: String!, $variantId: Int!, $quantity: Long!, $distributionChannelKey: String!, $locale: Locale!) {
    updateCart(
      id: $id
      version: $version
      actions: [
        {
          addLineItem: {
            productId: $productId
            variantId: $variantId
            quantity: $quantity
            distributionChannel: { key: $distributionChannelKey }
          }
        }
      ]
    ) {
      ...CartFields
    }
  }
`,
  [CartFragment]
);

const CartDistributionChannelQuery = graphql(`
  query ProviderCartDistributionChannel($storeKey: String!) {
    store(key: $storeKey) {
      distributionChannels {
        key
      }
    }
  }
`);

const ChangeItemsQuantityMutation = graphql(
  `
    mutation ChangeItemQuantity($id: String!, $version: Long!, $lineItemId: String!, $quantity: Long!, $locale: Locale!) {
      updateCart(
        id: $id
        version: $version
        actions: [
          {
            changeLineItemQuantity: {
              lineItemId: $lineItemId
              quantity: $quantity
            }
          }
        ]
      ) {
        ...CartFields
      }
    }
  `,
  [CartFragment]
);

const RemoveItemFromCartMutation = graphql(
  `
  mutation RemoveItemFromCart($id: String!, $version: Long!, $lineItemId: String!, $locale: Locale!) {
    updateCart(
      id: $id
      version: $version
      actions: [
        {
          removeLineItem: {
            lineItemId: $lineItemId
          }
        }
      ]
    ) {
      ...CartFields
    }
  }`,
  [CartFragment]
);

const SaveCheckoutContactMutation = graphql(
  `
  mutation SaveCheckoutContact($id: String!, $version: Long!, $actions: [CartUpdateAction!]!, $locale: Locale!) {
    updateCart(
      id: $id
      version: $version
      actions: $actions
    ) {
      ...CartFields
    }
  }`,
  [CartFragment]
);

const SaveCheckoutDeliveryDetailsMutation = graphql(
  `
  mutation SaveCheckoutDeliveryDetails($id: String!, $version: Long!, $actions: [CartUpdateAction!]!, $locale: Locale!) {
    updateCart(
      id: $id
      version: $version
      actions: $actions
    ) {
      ...CartFields
    }
  }`,
  [CartFragment]
);

export const makeCartPersistence = ({
  apiRoot,
  graphqlClient: client,
}: {
  readonly apiRoot: ByProjectKeyRequestBuilder;
  readonly graphqlClient: Pick<Client, "query" | "mutation">;
}) => {
  const executeCartUpdateAsAssociate = ({
    actions,
    cartId,
    scope,
    version,
  }: {
    readonly actions: CartUpdateAction[];
    readonly cartId: string;
    readonly scope: StorefrontCustomerCheckoutScope;
    readonly version: number;
  }) =>
    apiRoot
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

  const cartUpdateFailure = (
    cause: unknown,
    conflictMessage: string,
    failureMessage: string
  ) => {
    const isConflict = isConcurrentModification(cause);
    const providerCause = commercetoolsFailureCause(cause);

    return Err(
      domainError<object>(
        isConflict ? "CONFLICT" : "UNKNOWN",
        isConflict ? conflictMessage : failureMessage,
        undefined,
        providerCause
      )
    );
  };

  const canRetryCartUpdateWithCurrentVersion = (
    actions: readonly CartUpdateAction[]
  ) => actions.every((action) => action.action !== "setCustomType");

  const updateCartAsAssociate = async ({
    actions,
    cartId,
    conflictMessage,
    failureMessage,
    retryConcurrentModification = true,
    scope,
    version,
  }: {
    readonly actions: CartUpdateAction[];
    readonly cartId: string;
    readonly conflictMessage: string;
    readonly failureMessage: string;
    readonly retryConcurrentModification?: boolean;
    readonly scope: StorefrontCustomerCheckoutScope;
    readonly version: number;
  }): Promise<ActionResult<void>> => {
    const input = { actions, cartId, scope, version };
    const result = await Effect.runPromise(
      Effect.result(
        retryVersionedWrite({
          operation: "cart.updateAsAssociate",
          input,
          attempt: (current) =>
            commercetoolsRequest("Failed to update Cart as associate", () =>
              executeCartUpdateAsAssociate(current)
            ).pipe(Effect.asVoid),
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
        })
      )
    );

    return result._tag === "Success"
      ? Ok(undefined)
      : cartUpdateFailure(result.failure, conflictMessage, failureMessage);
  };

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
    Effect.runPromise(
      Effect.result(
        retryVersionedWrite({
          operation,
          input,
          attempt: (current) =>
            commercetoolsRequest(
              `Failed to execute GraphQL mutation ${operation}`,
              () => execute(current)
            ).pipe(
              Effect.flatMap((result) =>
                result.error !== undefined &&
                isConcurrentModification(result.error)
                  ? Effect.fail(result.error)
                  : Effect.succeed(result)
              )
            ),
          resolveConflict,
        })
      )
    );

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

  const activeCartForStorePredicate = (storeKey: string) =>
    `cartState="Active" and store(key=${JSON.stringify(storeKey)})`;

  const getActiveCartForAssociateScope = async (
    params: GetActiveCartForAssociateScopeParams
  ): Promise<ActionResult<CommercetoolsCart>> => {
    const result = await findActiveCartsForAssociateScope(params);

    if (!result.ok) {
      return result;
    }

    if (result.data.length === 0) {
      return Err(domainError("NOT_FOUND", "Cart not found"));
    }

    if (result.data.length > 1) {
      return Err(
        domainError<object>(
          "CONFLICT",
          "Multiple active Carts are available for the Store and Business Unit"
        )
      );
    }

    const cart = result.data[0];
    return cart ? Ok(cart) : Err(domainError("NOT_FOUND", "Cart not found"));
  };

  const findActiveCartsForAssociateScope = async (
    params: GetActiveCartForAssociateScopeParams
  ): Promise<ActionResult<readonly CommercetoolsCart[]>> => {
    const result = await client.query(
      GetActiveCartForBusinessUnitAsAssociateQuery,
      {
        associateId: params.associateId,
        businessUnitKey: params.businessUnitKey,
        where: activeCartForStorePredicate(params.storeKey),
        locale: params.locale,
      }
    );

    if (result.error?.networkError) {
      return Err(
        domainError<object>(
          "NETWORK_ERROR",
          `Failed to get active Cart for Store and Business Unit: ${result.error.message}`
        )
      );
    }

    if (result.error) {
      return Err(
        domainError<object>(
          "UNKNOWN",
          `Failed to get active Cart for Store and Business Unit: ${result.error.message}`,
          undefined,
          result.error
        )
      );
    }

    return Ok(
      (result.data?.asAssociate.carts.results ?? []).map((cart) =>
        reshapeCart(cart, params.locale)
      )
    );
  };

  const getCartById = async (
    id: string,
    locale: Locale
  ): Promise<ActionResult<CommercetoolsCart>> => {
    const result = await client.query(GetCartByIdQuery, {
      id,
      locale,
    });
    if (result.error?.networkError) {
      return Err(
        domainError<object>(
          "NETWORK_ERROR",
          `Failed to get cart by Id: ${result.error.message}`
        )
      );
    }
    if (!result.data?.cart) {
      return Err(domainError("NOT_FOUND", "Cart not found"));
    }

    return Ok(reshapeCart(result.data.cart, locale));
  };

  const createCart = async ({
    locale,
    currency,
    storeKey,
  }: CreateCartRepoParams): Promise<ActionResult<CommercetoolsCart>> => {
    const result = await client.mutation(CreateCartMutation, {
      currency,
      storeKey,
      locale,
    });

    if (result.error?.networkError) {
      return Err(
        domainError(
          "NETWORK_ERROR",
          `Failed to create cart: ${result.error.message}`
        )
      );
    }

    if (!result.data?.createCart) {
      return Err(
        domainError("UNKNOWN", "Failed to create cart: No data returned")
      );
    }

    return Ok(reshapeCart(result.data.createCart, locale));
  };

  const createCartForAssociateScope = async (
    params: CreateBusinessUnitCartRepoParams
  ): Promise<ActionResult<CommercetoolsCart>> => {
    const result = await Effect.runPromise(
      Effect.result(
        commercetoolsRequest("Failed to create Cart as associate", () =>
          apiRoot
            .asAssociate()
            .withAssociateIdValue({ associateId: String(params.associateId) })
            .inBusinessUnitKeyWithBusinessUnitKeyValue({
              businessUnitKey: String(params.businessUnitKey),
            })
            .carts()
            .post({
              body: {
                currency: params.currency,
                customerId: String(params.customerId),
                store: { key: String(params.storeKey), typeId: "store" },
              },
            })
            .execute()
        )
      )
    );

    if (result._tag === "Failure") {
      return Err(
        domainError<object>(
          "UNKNOWN",
          "Failed to create Cart as associate",
          undefined,
          result.failure
        )
      );
    }

    return getCartById(result.success.body.id, params.locale);
  };

  const addItemToCart = async (
    params: AddToCartRepoParams
  ): Promise<ActionResult<CommercetoolsCart>> => {
    const store = await client.query(CartDistributionChannelQuery, {
      storeKey: params.storeKey,
    });
    if (store.data?.store === null || store.data?.store === undefined) {
      throw new Error("Failed to resolve the Cart Store", {
        cause: store.error,
      });
    }
    const distributionChannelKey =
      store.data.store.distributionChannels[0]?.key ?? "";
    const { storeKey: _storeKey, ...cartInput } = params;
    const write = await executeVersionedGraphqlWrite({
      operation: "cart.addLineItem",
      input: { ...cartInput, distributionChannelKey },
      execute: (input) => client.mutation(AddItemToCartMutation, input),
      resolveConflict: (conflict, input) =>
        retryWithProviderVersion(conflict.currentVersion, input),
    });

    if (write._tag === "Failure") {
      return cartUpdateFailure(
        write.failure,
        "Cart changed before the item could be added",
        "Failed to add item to cart"
      );
    }

    const result = write.success;

    // TODO: Handle bad input errors, like invalid variantId or quantity probably in exchange/middlware layer.
    if (result.error?.networkError) {
      return Err(
        domainError(
          "NETWORK_ERROR",
          `Failed to add item to cart: ${result.error.message}`
        )
      );
    }

    if (result.error) {
      return Err(
        domainError<object>(
          "BAD_INPUT",
          `Failed to add item to cart: ${result.error.message}`,
          undefined,
          result.error
        )
      );
    }

    if (!result.data?.updateCart) {
      return Err(
        domainError("UNKNOWN", "Failed to add item to cart: No data returned")
      );
    }

    return Ok(reshapeCart(result.data.updateCart, params.locale));
  };

  const changeItemQuantity = async (
    params: ChangeItemQuantityParams
  ): Promise<ActionResult<CommercetoolsCart>> => {
    const write = await executeVersionedGraphqlWrite({
      operation: "cart.changeLineItemQuantity",
      input: params,
      execute: (input) => client.mutation(ChangeItemsQuantityMutation, input),
      resolveConflict: (conflict, input) =>
        retryWithProviderVersion(conflict.currentVersion, input),
    });

    if (write._tag === "Failure") {
      return cartUpdateFailure(
        write.failure,
        "Cart changed before the item quantity could be updated",
        "Failed to change item quantity"
      );
    }

    const result = write.success;

    if (result.error?.networkError) {
      return Err(
        domainError(
          "NETWORK_ERROR",
          `Failed to change item quantity: ${result.error.message}`
        )
      );
    }

    if (result.error) {
      return Err(
        domainError<object>(
          "BAD_INPUT",
          `Failed to change item quantity: ${result.error.message}`,
          undefined,
          result.error
        )
      );
    }

    if (!result.data?.updateCart) {
      return Err(
        domainError(
          "UNKNOWN",
          "Failed to change item quantity: No data returned"
        )
      );
    }

    return Ok(reshapeCart(result.data.updateCart, params.locale));
  };

  const removeItemFromCart = async (
    params: RemoveItemFromCartParams
  ): Promise<ActionResult<CommercetoolsCart>> => {
    const write = await executeVersionedGraphqlWrite({
      operation: "cart.removeLineItem",
      input: params,
      execute: (input) => client.mutation(RemoveItemFromCartMutation, input),
      resolveConflict: (conflict, input) =>
        retryWithProviderVersion(conflict.currentVersion, input),
    });

    if (write._tag === "Failure") {
      return cartUpdateFailure(
        write.failure,
        "Cart changed before the item could be removed",
        "Failed to remove item from cart"
      );
    }

    const result = write.success;

    if (result.error?.networkError) {
      return Err(
        domainError(
          "NETWORK_ERROR",
          `Failed to remove item from cart: ${result.error.message}`
        )
      );
    }

    if (result.error) {
      return Err(
        domainError<object>(
          "BAD_INPUT",
          `Failed to remove item from cart: ${result.error.message}`,
          undefined,
          result.error
        )
      );
    }

    if (!result.data?.updateCart) {
      return Err(
        domainError(
          "UNKNOWN",
          "Failed to remove item from cart: No data returned"
        )
      );
    }

    return Ok(reshapeCart(result.data.updateCart, params.locale));
  };

  const saveCheckoutContact = async (
    params: SaveCheckoutContactParams
  ): Promise<ActionResult<void>> => {
    const actions = buildSaveCheckoutContactActions(
      params.cart,
      params.contact
    );

    if (!actions.ok) {
      return actions;
    }

    if (params.scope.channel === "storefrontCustomer") {
      const contactValue = JSON.stringify(params.contact);
      const restActions: CartUpdateAction[] = [
        {
          action: "setCustomerEmail",
          email: params.contact.buyerContact.email,
        },
        params.cart.custom?.type?.key === ORDER_CUSTOM_TYPE_KEY
          ? {
              action: "setCustomField",
              name: CHECKOUT_CONTACT_CUSTOM_FIELD_NAME,
              value: contactValue,
            }
          : {
              action: "setCustomType",
              type: {
                key: ORDER_CUSTOM_TYPE_KEY,
                typeId: "type",
              },
              fields: {
                [CHECKOUT_CONTACT_CUSTOM_FIELD_NAME]: contactValue,
              },
            },
      ];

      return updateCartAsAssociate({
        actions: restActions,
        cartId: params.cart.id,
        conflictMessage: "Checkout Cart changed before Contact could be saved",
        failureMessage: "Failed to save checkout contact",
        retryConcurrentModification: params.retryConcurrentModification,
        scope: params.scope,
        version: params.cart.version,
      });
    }

    const input = {
      id: params.cart.id,
      version: params.cart.version,
      actions: actions.data,
      locale: params.locale,
    };
    const write = await executeVersionedGraphqlWrite({
      operation: "checkout.contact.save",
      input,
      execute: (current) =>
        client.mutation(SaveCheckoutContactMutation, current),
      resolveConflict: (conflict, current) =>
        params.retryConcurrentModification &&
        params.cart.custom?.type?.key === ORDER_CUSTOM_TYPE_KEY
          ? retryWithProviderVersion(conflict.currentVersion, current)
          : Effect.succeed(new PreserveVersionedWriteConflict()),
    });

    if (write._tag === "Failure") {
      return cartUpdateFailure(
        write.failure,
        "Checkout Cart changed before Contact could be saved",
        "Failed to save checkout contact"
      );
    }

    const result = write.success;

    if (result.error?.networkError) {
      return Err(
        domainError(
          "NETWORK_ERROR",
          `Failed to save checkout contact: ${result.error.message}`
        )
      );
    }

    if (result.error) {
      return Err(
        domainError(
          "UNKNOWN",
          `Failed to save checkout contact: ${result.error.message}`
        )
      );
    }

    if (!result.data?.updateCart) {
      return Err(
        domainError(
          "UNKNOWN",
          "Failed to save checkout contact: No data returned"
        )
      );
    }

    return Ok(undefined);
  };

  const saveCheckoutDeliveryDetails = async (
    params: SaveCheckoutDeliveryDetailsParams
  ): Promise<ActionResult<void>> => {
    const actions = buildSaveCheckoutDeliveryDetailsActions(
      params.deliveryDetails
    );

    if (params.scope.channel === "storefrontCustomer") {
      const restActions: CartUpdateAction[] = actions.map(
        ({ setShippingAddress }) => ({
          action: "setShippingAddress",
          address: setShippingAddress.address,
        })
      );

      return updateCartAsAssociate({
        actions: restActions,
        cartId: params.cart.id,
        conflictMessage:
          "Checkout Cart changed before Delivery Details could be saved",
        failureMessage: "Failed to save checkout delivery details",
        scope: params.scope,
        version: params.cart.version,
      });
    }

    const input = {
      id: params.cart.id,
      version: params.cart.version,
      actions,
      locale: params.locale,
    };
    const write = await executeVersionedGraphqlWrite({
      operation: "checkout.deliveryDetails.save",
      input,
      execute: (current) =>
        client.mutation(SaveCheckoutDeliveryDetailsMutation, current),
      resolveConflict: (conflict, current) =>
        retryWithProviderVersion(conflict.currentVersion, current),
    });

    if (write._tag === "Failure") {
      return cartUpdateFailure(
        write.failure,
        "Checkout Cart changed before Delivery Details could be saved",
        "Failed to save checkout delivery details"
      );
    }

    const result = write.success;

    if (result.error?.networkError) {
      return Err(
        domainError(
          "NETWORK_ERROR",
          `Failed to save checkout delivery details: ${result.error.message}`
        )
      );
    }

    if (result.error) {
      return Err(
        domainError(
          "UNKNOWN",
          `Failed to save checkout delivery details: ${result.error.message}`
        )
      );
    }

    if (!result.data?.updateCart) {
      return Err(
        domainError(
          "UNKNOWN",
          "Failed to save checkout delivery details: No data returned"
        )
      );
    }

    return Ok(undefined);
  };

  return {
    addItemToCart,
    changeItemQuantity,
    createCart,
    createCartForAssociateScope,
    findActiveCartsForAssociateScope,
    getActiveCartForAssociateScope,
    getCartById,
    removeItemFromCart,
    saveCheckoutContact,
    saveCheckoutDeliveryDetails,
  };
};
