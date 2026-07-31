import type { CartUpdateAction } from "@commercetools/platform-sdk";
import type { CurrencyCode, Locale } from "@repo/i18n/types";
import { Option, Schema } from "effect";
import type { FragmentOf } from "gql.tada";
import {
  CheckoutContact,
  type CheckoutDetails,
  ShippingAddress,
  type StorefrontCustomerCheckoutScope,
} from "../../domain/checkout";
import { CommerceBusinessUnitId } from "../../domain/commerce-account";
import { graphql, readFragment } from "../../graphql";
import { apiRootWithoutConcurrentModificationRetry } from "../client/api-root";
import { graphqlClient } from "../client/graphql-client";
import {
  type ProductTypeKey,
  reshapeProductAttributes,
} from "../product/mappers/attributes";
import { productPriceFragment, reshapePrice } from "../product/mappers/price";
import type { Cart, LineItem } from "../types";
import { type ActionResult, domainError, Err, Ok } from "../utils/errors";
import {
  buildSaveCheckoutContactActions,
  CHECKOUT_CONTACT_CUSTOM_FIELD_NAME,
  ORDER_CUSTOM_TYPE_KEY,
} from "./checkout-contact-actions";
import { buildSaveCheckoutDeliveryDetailsActions } from "./checkout-delivery-details-actions";
import type {
  AddToCartRepoParams,
  CartRepository,
  ChangeItemQuantityParams,
  CreateCartRepoParams,
  GetActiveCartForAssociateScopeParams,
  RemoveItemFromCartParams,
  SaveCheckoutContactParams,
  SaveCheckoutDeliveryDetailsParams,
} from "./types";

const client = graphqlClient();
const CONCURRENT_MODIFICATION_STATUS_CODE = 409;

type RawCustomField = {
  readonly name: string;
  readonly value: unknown;
};

const CommerceShippingAddress = Schema.Struct({
  streetName: Schema.NullOr(Schema.String),
  postalCode: Schema.NullOr(Schema.String),
  city: Schema.NullOr(Schema.String),
  country: Schema.String,
  additionalStreetInfo: Schema.NullOr(Schema.String),
  region: Schema.NullOr(Schema.String),
});

const decodeShippingAddress = (value: unknown) =>
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
      })
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

const getCheckoutDetails = (
  customFields: readonly RawCustomField[] | null | undefined,
  shippingAddress: ShippingAddress | null
): CheckoutDetails => {
  const contact = getCheckoutContactFromCustomFields(customFields);

  return {
    ...(contact === undefined ? {} : { contact }),
    ...(shippingAddress === null
      ? {}
      : {
          deliveryDetails: {
            source: "manual" as const,
            shippingAddress,
          },
        }),
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
): Cart => {
  const parsedData = readFragment(CartFragment, fragment);
  const shippingAddress = Option.getOrNull(
    decodeShippingAddress(parsedData.shippingAddress)
  );

  const lineItems: LineItem[] = parsedData.lineItems.map((item) => ({
    id: item.id,
    name: item.name,
    productId: item.productId,
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
  }));

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
      shippingAddress
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
  mutation CreateCart($currency: Currency!, $storeId: String!, $locale: Locale!) {
    createCart(
      draft: {
        currency: $currency
        store: {
          id: $storeId
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

const errorProperty = (error: unknown, property: string) =>
  typeof error === "object" && error !== null && property in error
    ? (error as Record<string, unknown>)[property]
    : undefined;

const errorCode = (error: unknown) => {
  const directCode = errorProperty(error, "code");
  if (typeof directCode === "string") {
    return directCode;
  }

  const extensions = errorProperty(error, "extensions");
  const extensionCode = errorProperty(extensions, "code");
  return typeof extensionCode === "string" ? extensionCode : undefined;
};

const hasConcurrentModificationError = (error: unknown) =>
  errorCode(error) === "ConcurrentModification" ||
  errorProperty(error, "statusCode") === CONCURRENT_MODIFICATION_STATUS_CODE;

const updateCartAsAssociate = async ({
  actions,
  cartId,
  conflictMessage,
  failureMessage,
  scope,
  version,
}: {
  readonly actions: CartUpdateAction[];
  readonly cartId: string;
  readonly conflictMessage: string;
  readonly failureMessage: string;
  readonly scope: StorefrontCustomerCheckoutScope;
  readonly version: number;
}): Promise<ActionResult<void>> => {
  try {
    await apiRootWithoutConcurrentModificationRetry
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

    return Ok(undefined);
  } catch (cause) {
    if (hasConcurrentModificationError(cause)) {
      return Err(
        domainError<object>("CONFLICT", conflictMessage, undefined, cause)
      );
    }

    return Err(
      domainError<object>("UNKNOWN", failureMessage, undefined, cause)
    );
  }
};

const activeCartForStorePredicate = (storeKey: string) =>
  `cartState="Active" and store(key=${JSON.stringify(storeKey)})`;

export const getActiveCartForAssociateScope = async (
  params: GetActiveCartForAssociateScopeParams
): Promise<ActionResult<Cart>> => {
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
      domainError(
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

  const carts = result.data?.asAssociate.carts.results ?? [];

  if (carts.length === 0) {
    return Err(domainError("NOT_FOUND", "Cart not found"));
  }

  if (carts.length > 1) {
    return Err(
      domainError(
        "CONFLICT",
        "Multiple active Carts are available for the Store and Business Unit"
      )
    );
  }

  const cart = carts[0];
  return cart
    ? Ok(reshapeCart(cart, params.locale))
    : Err(domainError("NOT_FOUND", "Cart not found"));
};

export const getCartById = async (
  id: string,
  locale: Locale
): Promise<ActionResult<Cart>> => {
  const result = await client.query(GetCartByIdQuery, {
    id,
    locale,
  });
  if (result.error?.networkError) {
    return Err(
      domainError(
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

export const createCart = async ({
  locale,
  currency,
  storeId,
}: CreateCartRepoParams): Promise<ActionResult<Cart>> => {
  const result = await client.mutation(CreateCartMutation, {
    currency,
    storeId,
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

export const addItemToCart = async (
  params: AddToCartRepoParams
): Promise<ActionResult<Cart>> => {
  const result = await client.mutation(AddItemToCartMutation, params);

  // TODO: Handle bad input errors, like invalid variantId or quantity probably in exchange/middlware layer.
  if (result.error?.networkError) {
    return Err(
      domainError(
        "NETWORK_ERROR",
        `Failed to add item to cart: ${result.error.message}`
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

export const changeItemQuantity = async (
  params: ChangeItemQuantityParams
): Promise<ActionResult<Cart>> => {
  const result = await client.mutation(ChangeItemsQuantityMutation, params);

  if (result.error?.networkError) {
    return Err(
      domainError(
        "NETWORK_ERROR",
        `Failed to change item quantity: ${result.error.message}`
      )
    );
  }

  if (!result.data?.updateCart) {
    return Err(
      domainError("UNKNOWN", "Failed to change item quantity: No data returned")
    );
  }

  return Ok(reshapeCart(result.data.updateCart, params.locale));
};

export const removeItemFromCart = async (
  params: RemoveItemFromCartParams
): Promise<ActionResult<Cart>> => {
  const result = await client.mutation(RemoveItemFromCartMutation, params);

  if (result.error?.networkError) {
    return Err(
      domainError(
        "NETWORK_ERROR",
        `Failed to remove item from cart: ${result.error.message}`
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

export const saveCheckoutContact = async (
  params: SaveCheckoutContactParams
): Promise<ActionResult<void>> => {
  const actions = buildSaveCheckoutContactActions(params.cart, params.contact);

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
      scope: params.scope,
      version: params.cart.version,
    });
  }

  const result = await client.mutation(SaveCheckoutContactMutation, {
    id: params.cart.id,
    version: params.cart.version,
    actions: actions.data,
    locale: params.locale,
  });

  if (result.error?.graphQLErrors.some(hasConcurrentModificationError)) {
    return Err(
      domainError(
        "CONFLICT",
        "Checkout Cart changed before Contact could be saved"
      )
    );
  }

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

export const saveCheckoutDeliveryDetails = async (
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

  const result = await client.mutation(SaveCheckoutDeliveryDetailsMutation, {
    id: params.cart.id,
    version: params.cart.version,
    actions,
    locale: params.locale,
  });

  if (result.error?.graphQLErrors.some(hasConcurrentModificationError)) {
    return Err(
      domainError(
        "CONFLICT",
        "Checkout Cart changed before Delivery Details could be saved"
      )
    );
  }

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

export const cartRepo: CartRepository = {
  getActiveCartForAssociateScope,
  getCartById,
  createCart,
  addItemToCart,
  changeItemQuantity,
  removeItemFromCart,
  saveCheckoutContact,
  saveCheckoutDeliveryDetails,
};
