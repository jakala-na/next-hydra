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
import type { CurrencyCode, Locale } from "@repo/i18n/types";
import type { Client } from "@urql/core";
import { Effect, Option, Schema } from "effect";
import type { FragmentOf } from "gql.tada";
import { fromCommercetoolsAddressKey } from "../address-book/address-book-key";
import {
  type CommercetoolsConcurrentModification,
  commercetoolsFailureCause,
  commercetoolsRequest,
  hasCommercetoolsErrorCode,
  isCommercetoolsAccessDenied,
  isCommercetoolsClientFailure,
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
import {
  CommercetoolsCartAccessDenied,
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
import { productPriceFragment, reshapePrice } from "./price";
import type { CommercetoolsCart, CommercetoolsLineItem } from "./provider-cart";

type RawCustomField = {
  readonly name: string;
  readonly value: unknown;
};

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
              item.variant.attributesRaw || [],
              locale
            ),
            images:
              item.variant.images.map((image) => ({
                altText: image.label ?? "",
                url: image.url,
              })) || [],
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
      currencyCode: parsedData.totalPrice.currencyCode as CurrencyCode,
    },
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

  const providerContractDefect = (message: string, cause?: unknown) =>
    new Error(message, cause === undefined ? undefined : { cause });

  const cartWriteFailure = (
    cause: unknown
  ): Effect.Effect<
    never,
    | CommercetoolsCartAccessDenied
    | CommercetoolsCartVersionConflict
    | CommercetoolsCartWriteOutcomeUnknown
  > => {
    const providerCause = commercetoolsFailureCause(cause);

    if (isConcurrentModification(cause)) {
      return Effect.fail(
        new CommercetoolsCartVersionConflict({ cause: providerCause })
      );
    }

    if (isCommercetoolsAccessDenied(providerCause)) {
      return Effect.fail(
        new CommercetoolsCartAccessDenied({ cause: providerCause })
      );
    }

    if (isCommercetoolsClientFailure(providerCause)) {
      return Effect.die(providerCause);
    }

    return Effect.fail(
      new CommercetoolsCartWriteOutcomeUnknown({ cause: providerCause })
    );
  };

  const cartCreateFailure = (
    cause: unknown
  ): Effect.Effect<
    never,
    CommercetoolsCartAccessDenied | CommercetoolsCartWriteOutcomeUnknown
  > => {
    const providerCause = commercetoolsFailureCause(cause);

    if (isCommercetoolsAccessDenied(providerCause)) {
      return Effect.fail(
        new CommercetoolsCartAccessDenied({ cause: providerCause })
      );
    }

    if (isCommercetoolsClientFailure(providerCause)) {
      return Effect.die(providerCause);
    }

    return Effect.fail(
      new CommercetoolsCartWriteOutcomeUnknown({ cause: providerCause })
    );
  };

  const cartMutationFailure = (error: {
    readonly networkError?: unknown;
  }): Effect.Effect<
    never,
    CommercetoolsCartAccessDenied | CommercetoolsCartWriteOutcomeUnknown
  > => {
    if (error.networkError !== undefined) {
      return Effect.fail(
        new CommercetoolsCartWriteOutcomeUnknown({ cause: error })
      );
    }

    if (isCommercetoolsAccessDenied(error)) {
      return Effect.fail(new CommercetoolsCartAccessDenied({ cause: error }));
    }

    return Effect.die(error);
  };

  const missingCartMutationData = (operation: string) =>
    Effect.fail(
      new CommercetoolsCartWriteOutcomeUnknown({
        cause: providerContractDefect(
          `Commercetools returned no Cart after ${operation}`
        ),
      })
    );

  const canRetryCartUpdateWithCurrentVersion = (
    actions: readonly CartUpdateAction[]
  ) => actions.every((action) => action.action !== "setCustomType");

  const updateCartAsAssociate = ({
    actions,
    cartId,
    retryConcurrentModification = true,
    scope,
    version,
  }: {
    readonly actions: CartUpdateAction[];
    readonly cartId: string;
    readonly retryConcurrentModification?: boolean;
    readonly scope: StorefrontCustomerCheckoutScope;
    readonly version: number;
  }) => {
    const input = { actions, cartId, scope, version };
    return retryVersionedWrite({
      attempt: (current) =>
        commercetoolsRequest("Failed to update Cart as associate", () =>
          executeCartUpdateAsAssociate(current)
        ).pipe(Effect.asVoid),
      input,
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
    }).pipe(Effect.catch(cartWriteFailure));
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

  const graphqlRead = <A>(
    request: () => PromiseLike<A>
  ): Effect.Effect<A, CommercetoolsUnavailable> =>
    Effect.tryPromise({
      catch: (cause) => new CommercetoolsUnavailable({ cause }),
      try: () => Promise.resolve(request()),
    });

  const graphqlCreate = <A>(request: () => PromiseLike<A>) =>
    Effect.tryPromise({
      catch: (cause) => new CommercetoolsCartWriteOutcomeUnknown({ cause }),
      try: () => Promise.resolve(request()),
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

  const activeCartForStorePredicate = (storeKey: string) =>
    `cartState="Active" and store(key=${JSON.stringify(storeKey)})`;

  const findActiveCartsForAssociateScope = (
    params: GetActiveCartForAssociateScopeParams
  ) =>
    Effect.gen(function* () {
      const result = yield* graphqlRead(() =>
        client.query(GetActiveCartForBusinessUnitAsAssociateQuery, {
          associateId: params.associateId,
          businessUnitKey: params.businessUnitKey,
          locale: params.locale,
          where: activeCartForStorePredicate(params.storeKey),
        })
      );

      if (result.error?.networkError) {
        return yield* new CommercetoolsUnavailable({ cause: result.error });
      }

      if (result.error) {
        return yield* isCommercetoolsAccessDenied(result.error)
          ? new CommercetoolsCartAccessDenied({ cause: result.error })
          : Effect.die(result.error);
      }

      if (result.data === undefined) {
        return yield* Effect.die(
          providerContractDefect(
            "Commercetools returned no data while finding active Carts"
          )
        );
      }

      return result.data.asAssociate.carts.results.map((cart) =>
        reshapeCart(cart, params.locale)
      );
    });

  const getCartById = (id: string, locale: Locale) =>
    Effect.gen(function* () {
      const result = yield* graphqlRead(() =>
        client.query(GetCartByIdQuery, { id, locale })
      );

      if (result.error?.networkError) {
        return yield* new CommercetoolsUnavailable({ cause: result.error });
      }

      if (result.error) {
        return yield* isCommercetoolsAccessDenied(result.error)
          ? new CommercetoolsCartAccessDenied({ cause: result.error })
          : Effect.die(result.error);
      }

      if (result.data === undefined) {
        return yield* Effect.die(
          providerContractDefect(
            "Commercetools returned no data while finding a Cart"
          )
        );
      }

      if (result.data.cart === null) {
        return yield* new CommercetoolsCartNotFound({ cartId: id });
      }

      return reshapeCart(result.data.cart, locale);
    });

  const createCart = ({ locale, currency, storeKey }: CreateCartRepoParams) =>
    Effect.gen(function* () {
      const result = yield* graphqlCreate(() =>
        client.mutation(CreateCartMutation, { currency, locale, storeKey })
      );

      if (result.error) {
        return yield* cartMutationFailure(result.error);
      }

      if (!result.data?.createCart) {
        return yield* missingCartMutationData("creating a Cart");
      }

      return reshapeCart(result.data.createCart, locale);
    });

  const createCartForAssociateScope = (
    params: CreateBusinessUnitCartRepoParams
  ) =>
    Effect.gen(function* () {
      const response = yield* commercetoolsRequest(
        "Failed to create Cart as associate",
        () =>
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
      ).pipe(Effect.catch(cartCreateFailure));

      return yield* getCartById(response.body.id, params.locale).pipe(
        Effect.catch((cause) =>
          Effect.fail(new CommercetoolsCartWriteOutcomeUnknown({ cause }))
        )
      );
    });

  const addItemToCart = (params: AddToCartRepoParams) =>
    Effect.gen(function* () {
      const store = yield* graphqlRead(() =>
        client.query(CartDistributionChannelQuery, {
          storeKey: params.storeKey,
        })
      );
      if (store.error?.networkError) {
        return yield* new CommercetoolsUnavailable({ cause: store.error });
      }
      if (store.error) {
        return yield* Effect.die(store.error);
      }

      const distributionChannelKey =
        store.data?.store?.distributionChannels[0]?.key;
      if (distributionChannelKey === undefined) {
        return yield* Effect.die(
          providerContractDefect(
            `Commercetools Store ${String(params.storeKey)} has no distribution channel`
          )
        );
      }
      const { storeKey: _storeKey, ...cartInput } = params;
      const result = yield* executeVersionedGraphqlWrite({
        execute: (input) => client.mutation(AddItemToCartMutation, input),
        input: { ...cartInput, distributionChannelKey },
        operation: "cart.addLineItem",
        resolveConflict: (conflict, input) =>
          retryWithProviderVersion(conflict.currentVersion, input),
      }).pipe(Effect.catch(cartWriteFailure));

      if (result.error) {
        if (
          hasCommercetoolsErrorCode(
            result.error,
            "InvalidInput",
            "MatchingPriceNotFound"
          )
        ) {
          return yield* new CommercetoolsCartMerchandiseUnavailable({
            cause: result.error,
          });
        }
        return yield* cartMutationFailure(result.error);
      }

      if (!result.data?.updateCart) {
        return yield* missingCartMutationData("adding a Cart line item");
      }

      return reshapeCart(result.data.updateCart, params.locale);
    });

  const changeItemQuantity = (params: ChangeItemQuantityParams) =>
    Effect.gen(function* () {
      const result = yield* executeVersionedGraphqlWrite({
        execute: (input) => client.mutation(ChangeItemsQuantityMutation, input),
        input: params,
        operation: "cart.changeLineItemQuantity",
        resolveConflict: (conflict, input) =>
          retryWithProviderVersion(conflict.currentVersion, input),
      }).pipe(Effect.catch(cartWriteFailure));

      if (result.error) {
        return yield* cartMutationFailure(result.error);
      }

      if (!result.data?.updateCart) {
        return yield* missingCartMutationData(
          "changing a Cart line-item quantity"
        );
      }

      return reshapeCart(result.data.updateCart, params.locale);
    });

  const removeItemFromCart = (params: RemoveItemFromCartParams) =>
    Effect.gen(function* () {
      const result = yield* executeVersionedGraphqlWrite({
        execute: (input) => client.mutation(RemoveItemFromCartMutation, input),
        input: params,
        operation: "cart.removeLineItem",
        resolveConflict: (conflict, input) =>
          retryWithProviderVersion(conflict.currentVersion, input),
      }).pipe(Effect.catch(cartWriteFailure));

      if (result.error) {
        return yield* cartMutationFailure(result.error);
      }

      if (!result.data?.updateCart) {
        return yield* missingCartMutationData("removing a Cart line item");
      }

      return reshapeCart(result.data.updateCart, params.locale);
    });

  const saveCheckoutContact = (params: SaveCheckoutContactParams) =>
    Effect.gen(function* () {
      const actions = yield* buildSaveCheckoutContactActions(
        params.cart,
        params.contact
      );

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
                fields: {
                  [CHECKOUT_CONTACT_CUSTOM_FIELD_NAME]: contactValue,
                },
                type: {
                  key: ORDER_CUSTOM_TYPE_KEY,
                  typeId: "type",
                },
              },
        ];

        return yield* updateCartAsAssociate({
          actions: restActions,
          cartId: params.cart.id,
          retryConcurrentModification: params.retryConcurrentModification,
          scope: params.scope,
          version: params.cart.version,
        });
      }

      const input = {
        actions,
        id: params.cart.id,
        locale: params.locale,
        version: params.cart.version,
      };
      const result = yield* executeVersionedGraphqlWrite({
        execute: (current) =>
          client.mutation(SaveCheckoutContactMutation, current),
        input,
        operation: "checkout.contact.save",
        resolveConflict: (conflict, current) =>
          params.retryConcurrentModification &&
          params.cart.custom?.type?.key === ORDER_CUSTOM_TYPE_KEY
            ? retryWithProviderVersion(conflict.currentVersion, current)
            : Effect.succeed(new PreserveVersionedWriteConflict()),
      }).pipe(Effect.catch(cartWriteFailure));

      if (result.error) {
        return yield* cartMutationFailure(result.error);
      }

      if (!result.data?.updateCart) {
        return yield* missingCartMutationData("saving Cart Contact");
      }
    });

  const saveCheckoutDeliveryDetails = (
    params: SaveCheckoutDeliveryDetailsParams
  ) =>
    Effect.gen(function* () {
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

        return yield* updateCartAsAssociate({
          actions: restActions,
          cartId: params.cart.id,
          scope: params.scope,
          version: params.cart.version,
        });
      }

      const input = {
        actions,
        id: params.cart.id,
        locale: params.locale,
        version: params.cart.version,
      };
      const result = yield* executeVersionedGraphqlWrite({
        execute: (current) =>
          client.mutation(SaveCheckoutDeliveryDetailsMutation, current),
        input,
        operation: "checkout.deliveryDetails.save",
        resolveConflict: (conflict, current) =>
          retryWithProviderVersion(conflict.currentVersion, current),
      }).pipe(Effect.catch(cartWriteFailure));

      if (result.error) {
        return yield* cartMutationFailure(result.error);
      }

      if (!result.data?.updateCart) {
        return yield* missingCartMutationData("saving Cart Delivery Details");
      }
    });

  return {
    addItemToCart,
    changeItemQuantity,
    createCart,
    createCartForAssociateScope,
    findActiveCartsForAssociateScope,
    getCartById,
    removeItemFromCart,
    saveCheckoutContact,
    saveCheckoutDeliveryDetails,
  };
};
